const { expect } = require('chai');
const jwt = require('jsonwebtoken');
const sinon = require('sinon');

// Cargar el módulo env real pero con variables de prueba
process.env.JWT_SECRET = 'test-secret-para-pruebas';
process.env.JWT_EXPIRES_IN = '12h';
process.env.NODE_ENV = 'test';

// Mock de las dependencias
const mockEnv = {
  jwtSecret: 'test-secret-para-pruebas',
  jwtExpiresIn: '12h',
};

// Stub para el módulo env
const Module = require('module');

const originalRequire = Module.prototype.require;

let envRequireCount = 0;
Module.prototype.require = function (id) {
  if (id.includes('config/env') || id === '../config/env' || id === './env' || id.includes('/config/env')) {
    envRequireCount++;
    return mockEnv;
  }
  return originalRequire.apply(this, arguments);
};

// Ahora sí requerimos los módulos
const authMiddleware = require('../src/middlewares/auth');
const isAdminMiddleware = require('../src/middlewares/isAdmin');
const attachUserMiddleware = require('../src/middlewares/attachUser');
const User = require('../src/models/user');
const ApiError = require('../src/utils/ApiError');

// Mock del User model
const mockUser = {
  _id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
  password: 'hashed-password',
  isAdmin() { return false; },
};

const mockAdminUser = {
  _id: 'admin-user-id',
  email: 'admin@example.com',
  name: 'Admin User',
  role: 'admin',
  password: 'hashed-password',
  isAdmin() { return true; },
};

// Override User.findById
const findByIdStub = sinon.stub();
User.findById = findByIdStub;

// Override User.findOne
const findOneStub = sinon.stub();
User.findOne = findOneStub;

// Override User.create
const createStub = sinon.stub();
User.create = createStub;

// Override User.findByCredentials
const findByCredentialsStub = sinon.stub();
User.findByCredentials = findByCredentialsStub;

// Override User.isAdminEmail
User.isAdminEmail = function (email) {
  return ['darelisbatistag@gmail.com', 'enmanuel676hd@gmail.com'].includes(email?.toLowerCase()?.trim());
};

// Stub para console para evitar salida en tests
sinon.stub(console, 'log');
sinon.stub(console, 'warn');
sinon.stub(console, 'error');

// Helper para crear un mock de request/response
function createMockReqRes() {
  return {
    req: {
      headers: {},
      user: null,
      fullUser: null,
      adminUser: null,
      body: {},
      originalUrl: '/test',
      ip: '127.0.0.1',
      get: sinon.stub().returns('Mozilla/5.0'),
    },
    res: {
      cookie: sinon.stub(),
      clearCookie: sinon.stub(),
      send: sinon.stub(),
      status: sinon.stub().returnsThis(),
      json: sinon.stub(),
    },
    next: sinon.stub(),
  };
}

// Helper para crear un token JWT válido
testToken = 'test-valid-token';

describe('Backend Authentication System', () => {
  beforeEach(() => {
    // Reset all stubs
    findByIdStub.reset();
    findOneStub.reset();
    createStub.reset();
    findByCredentialsStub.reset();
    sinon.restore();
    sinon.stub(console, 'log');
    sinon.stub(console, 'warn');
    sinon.stub(console, 'error');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Middleware: auth.js', () => {
    it('should return 401 if no token provided', () => {
      const { req, res, next } = createMockReqRes();

      authMiddleware(req, res, next);

      expect(next.calledOnce).to.be.true;
      expect(next.firstCall.args[0]).to.be.instanceOf(ApiError);
      expect(next.firstCall.args[0].statusCode).to.equal(401);
      expect(next.firstCall.args[0].message).to.equal('Se requiere iniciar sesión.');
    });

    it('should return 401 if Authorization header is malformed', () => {
      const { req, res, next } = createMockReqRes();
      req.headers.authorization = 'InvalidFormat';

      authMiddleware(req, res, next);

      expect(next.calledOnce).to.be.true;
      expect(next.firstCall.args[0]).to.be.instanceOf(ApiError);
      expect(next.firstCall.args[0].statusCode).to.equal(401);
    });

    it('should return 401 if token is invalid (jwt.verify throws)', () => {
      const { req, res, next } = createMockReqRes();
      req.headers.authorization = 'Bearer invalid-token';

      // Stub jwt.verify para que lance error
      const verifyStub = sinon.stub(jwt, 'verify');
      verifyStub.throws(new Error('Invalid token'));

      authMiddleware(req, res, next);

      expect(next.calledOnce).to.be.true;
      expect(next.firstCall.args[0]).to.be.instanceOf(ApiError);
      expect(next.firstCall.args[0].statusCode).to.equal(401);
      expect(next.firstCall.args[0].message).to.equal('Sesión caducada. Vuelve a iniciar sesión.');

      verifyStub.restore();
    });

    it('should return 401 if token is expired (jwt.verify throws)', () => {
      const { req, res, next } = createMockReqRes();
      req.headers.authorization = 'Bearer expired-token';

      const verifyStub = sinon.stub(jwt, 'verify');
      verifyStub.throws(new Error('Token expired'));

      authMiddleware(req, res, next);

      expect(next.calledOnce).to.be.true;
      expect(next.firstCall.args[0]).to.be.instanceOf(ApiError);
      expect(next.firstCall.args[0].statusCode).to.equal(401);

      verifyStub.restore();
    });

    it('should return 401 if cookie header is empty', () => {
      const { req, res, next } = createMockReqRes();
      req.headers.cookie = '';

      authMiddleware(req, res, next);

      expect(next.calledOnce).to.be.true;
      expect(next.firstCall.args[0]).to.be.instanceOf(ApiError);
      expect(next.firstCall.args[0].statusCode).to.equal(401);
    });

    it('should call next with user when token is valid', () => {
      const { req, res, next } = createMockReqRes();
      req.headers.authorization = 'Bearer valid-token';

      const verifyStub = sinon.stub(jwt, 'verify');
      verifyStub.returns({ _id: 'test-user-id', email: 'test@example.com' });

      authMiddleware(req, res, next);

      expect(req.user).to.deep.equal({ _id: 'test-user-id', email: 'test@example.com' });
      expect(next.calledOnce).to.be.true;
      expect(next.firstCall.args.length).to.equal(0); // next() called without arguments

      verifyStub.restore();
    });

    it('should accept token from cookie when Authorization header not present', () => {
      const { req, res, next } = createMockReqRes();
      req.headers.cookie = 'lamar_token=cookie-token-value';

      const verifyStub = sinon.stub(jwt, 'verify');
      verifyStub.returns({ _id: 'cookie-user-id' });

      authMiddleware(req, res, next);

      expect(req.user).to.deep.equal({ _id: 'cookie-user-id' });
      expect(next.calledOnce).to.be.true;

      verifyStub.restore();
    });

    it('should prioritize Authorization header over cookie', () => {
      const { req, res, next } = createMockReqRes();
      req.headers.authorization = 'Bearer header-token';
      req.headers.cookie = 'lamar_token=cookie-token';

      let capturedToken = null;
      const verifyStub = sinon.stub(jwt, 'verify');
      verifyStub.callsFake((token) => {
        capturedToken = token;
        return { _id: 'test-user-id' };
      });

      authMiddleware(req, res, next);

      expect(capturedToken).to.equal('header-token');

      verifyStub.restore();
    });

    it('should restore a missing cookie from a valid saved token for direct API navigation', () => {
      const token = jwt.sign({ _id: 'returning-user' }, mockEnv.jwtSecret, { expiresIn: '1h' });
      const panel = createMockReqRes();
      panel.req.headers.authorization = `Bearer ${token}`;
      panel.req.headers['x-forwarded-proto'] = 'https';

      authMiddleware(panel.req, panel.res, panel.next);

      expect(panel.next.calledOnceWithExactly()).to.be.true;
      expect(panel.res.cookie.calledOnce).to.be.true;
      expect(panel.res.cookie.firstCall.args).to.deep.equal([
        'lamar_token', token,
        { httpOnly: true, sameSite: 'lax', secure: true, path: '/' },
      ]);

      const navigation = createMockReqRes();
      navigation.req.headers.cookie = `lamar_token=${encodeURIComponent(panel.res.cookie.firstCall.args[1])}`;
      authMiddleware(navigation.req, navigation.res, navigation.next);

      expect(navigation.next.calledOnceWithExactly()).to.be.true;
      expect(navigation.req.user._id).to.equal('returning-user');
      expect(navigation.res.cookie.called).to.be.false;
    });

    it('should replace a stale cookie with the account authenticated by the panel', () => {
      const token = jwt.sign({ _id: 'current-user' }, mockEnv.jwtSecret, { expiresIn: '1h' });
      const { req, res, next } = createMockReqRes();
      req.headers.authorization = `Bearer ${token}`;
      req.headers.cookie = 'lamar_token=old-token';

      authMiddleware(req, res, next);

      expect(next.calledOnceWithExactly()).to.be.true;
      expect(res.cookie.firstCall.args[1]).to.equal(token);
      expect(res.cookie.firstCall.args[2].secure).to.be.false;
    });

    it('should not rewrite an already synchronized cookie', () => {
      const token = jwt.sign({ _id: 'current-user' }, mockEnv.jwtSecret, { expiresIn: '1h' });
      const { req, res, next } = createMockReqRes();
      req.headers.authorization = `Bearer ${token}`;
      req.headers.cookie = `lamar_token=${token}`;

      authMiddleware(req, res, next);

      expect(next.calledOnceWithExactly()).to.be.true;
      expect(res.cookie.called).to.be.false;
    });

    it('should recover a malformed cookie only when a valid Bearer is supplied', () => {
      const { req, res, next } = createMockReqRes();
      req.headers.cookie = 'lamar_token=%E0%A4%A';
      authMiddleware(req, res, next);
      expect(next.firstCall.args[0].statusCode).to.equal(401);
      expect(res.cookie.called).to.be.false;

      next.resetHistory();
      const token = jwt.sign({ _id: 'current-user' }, mockEnv.jwtSecret, { expiresIn: '1h' });
      req.headers.authorization = `Bearer ${token}`;
      authMiddleware(req, res, next);

      expect(next.calledOnceWithExactly()).to.be.true;
      expect(res.cookie.firstCall.args[1]).to.equal(token);
    });

    it('should never create a cookie from an expired, forged or incomplete token', () => {
      const tokens = [
        jwt.sign({ _id: 'user' }, mockEnv.jwtSecret, { expiresIn: -1 }),
        jwt.sign({ _id: 'user' }, 'another-secret', { expiresIn: '1h' }),
        jwt.sign({}, mockEnv.jwtSecret, { expiresIn: '1h' }),
      ];
      tokens.forEach((token) => {
        const { req, res, next } = createMockReqRes();
        req.headers.authorization = `Bearer ${token}`;
        authMiddleware(req, res, next);
        expect(next.firstCall.args[0].statusCode).to.equal(401);
        expect(res.cookie.called).to.be.false;
      });
    });
  });

  describe('Middleware: isAdmin.js', () => {
    it('should allow access for admin user', async () => {
      const { req, res, next } = createMockReqRes();
      req.user = { _id: 'admin-user-id' };

      findByIdStub.resolves(mockAdminUser);

      await isAdminMiddleware(req, res, next);

      expect(findByIdStub.calledWith('admin-user-id')).to.be.true;
      expect(req.adminUser).to.deep.equal(mockAdminUser);
      expect(next.calledOnce).to.be.true;
      expect(next.firstCall.args.length).to.equal(0);
    });

    it('should deny access for non-admin user with 403', async () => {
      const { req, res, next } = createMockReqRes();
      req.user = { _id: 'test-user-id' };

      findByIdStub.resolves(mockUser);

      await isAdminMiddleware(req, res, next);

      expect(next.calledOnce).to.be.true;
      expect(next.firstCall.args[0]).to.be.instanceOf(ApiError);
      expect(next.firstCall.args[0].statusCode).to.equal(403);
      expect(next.firstCall.args[0].message).to.equal('No tienes permisos para realizar esta acción.');
    });

    it('should return 401 if user not found', async () => {
      const { req, res, next } = createMockReqRes();
      req.user = { _id: 'non-existent-user-id' };

      findByIdStub.resolves(null);

      await isAdminMiddleware(req, res, next);

      expect(next.calledOnce).to.be.true;
      expect(next.firstCall.args[0]).to.be.instanceOf(ApiError);
      expect(next.firstCall.args[0].statusCode).to.equal(401);
      expect(next.firstCall.args[0].message).to.equal('Usuario no encontrado.');
    });

    it('should handle database errors', async () => {
      const { req, res, next } = createMockReqRes();
      req.user = { _id: 'test-user-id' };

      findByIdStub.rejects(new Error('Database error'));

      await isAdminMiddleware(req, res, next);

      expect(next.calledOnce).to.be.true;
      expect(next.firstCall.args[0]).to.be.instanceOf(Error);
    });

    it('should check ADMIN_EMAILS for admin access', async () => {
      const { req, res, next } = createMockReqRes();
      req.user = { _id: 'admin-by-email-id' };

      const adminByEmailUser = {
        _id: 'admin-by-email-id',
        email: 'darelisbatistag@gmail.com',
        name: 'Admin by Email',
        role: 'user',
        password: 'hashed-password',
        isAdmin() { return true; },
      };

      findByIdStub.resolves(adminByEmailUser);

      await isAdminMiddleware(req, res, next);

      expect(req.adminUser).to.deep.equal(adminByEmailUser);
      expect(next.calledOnce).to.be.true;
    });
  });

  describe('Middleware: attachUser.js', () => {
    it('should attach user to req.fullUser if user exists', async () => {
      const { req, res, next } = createMockReqRes();
      req.user = { _id: 'test-user-id' };

      findByIdStub.resolves(mockUser);

      await attachUserMiddleware(req, res, next);

      expect(findByIdStub.calledWith('test-user-id')).to.be.true;
      expect(req.fullUser).to.deep.equal(mockUser);
      expect(next.calledOnce).to.be.true;
      expect(next.firstCall.args.length).to.equal(0);
    });

    it('should attach adminUser if user is admin', async () => {
      const { req, res, next } = createMockReqRes();
      req.user = { _id: 'admin-user-id' };

      findByIdStub.resolves(mockAdminUser);

      await attachUserMiddleware(req, res, next);

      expect(req.fullUser).to.deep.equal(mockAdminUser);
      expect(req.adminUser).to.deep.equal(mockAdminUser);
      expect(next.calledOnce).to.be.true;
    });

    it('should call next even if user not found', async () => {
      const { req, res, next } = createMockReqRes();
      req.user = { _id: 'test-user-id' };

      findByIdStub.resolves(null);

      await attachUserMiddleware(req, res, next);

      expect(req.fullUser).to.be.null;
      expect(next.calledOnce).to.be.true;
    });

    it('should call next even if req.user is not set', async () => {
      const { req, res, next } = createMockReqRes();

      await attachUserMiddleware(req, res, next);

      expect(next.calledOnce).to.be.true;
    });

    it('should call next even if req.user._id is not set', async () => {
      const { req, res, next } = createMockReqRes();
      req.user = {};

      await attachUserMiddleware(req, res, next);

      expect(next.calledOnce).to.be.true;
    });

    it('should handle database errors gracefully', async () => {
      const { req, res, next } = createMockReqRes();
      req.user = { _id: 'test-user-id' };

      findByIdStub.rejects(new Error('Database error'));

      await attachUserMiddleware(req, res, next);

      expect(next.calledOnce).to.be.true;
    });
  });

  describe('Controller: auth.js - login', () => {
    it('should return token and user data on successful login', async () => {
      const { req, res, next } = createMockReqRes();
      req.body = { email: 'test@example.com', password: 'password' };

      findByCredentialsStub.resolves(mockUser);

      await require('../src/controllers/auth').login(req, res, next);

      expect(findByCredentialsStub.calledWith('test@example.com', 'password')).to.be.true;
      expect(res.send.calledOnce).to.be.true;
      expect(res.send.firstCall.args[0]).to.have.property('token');
      expect(res.send.firstCall.args[0]).to.have.property('user');
      expect(res.send.firstCall.args[0].user).to.have.property('email', 'test@example.com');
      expect(res.send.firstCall.args[0].user).to.have.property('name', 'Test User');
      expect(res.send.firstCall.args[0].user).to.have.property('role', 'user');
      expect(res.send.firstCall.args[0].user).to.have.property('isAdmin', false);
    });

    it('should return 401 if credentials are invalid', async () => {
      const { req, res, next } = createMockReqRes();
      req.body = { email: 'invalid@example.com', password: 'wrongpassword' };

      findByCredentialsStub.resolves(null);

      await require('../src/controllers/auth').login(req, res, next);

      expect(next.calledOnce).to.be.true;
      expect(next.firstCall.args[0]).to.be.instanceOf(ApiError);
      expect(next.firstCall.args[0].statusCode).to.equal(401);
      expect(next.firstCall.args[0].message).to.equal('Correo o contraseña incorrectos.');
    });

    it('should return user data with isAdmin field for admin user', async () => {
      const { req, res, next } = createMockReqRes();
      req.body = { email: 'admin@example.com', password: 'password' };

      findByCredentialsStub.resolves(mockAdminUser);

      await require('../src/controllers/auth').login(req, res, next);

      expect(res.send.firstCall.args[0].user).to.have.property('isAdmin', true);
      expect(res.send.firstCall.args[0].user).to.have.property('role', 'admin');
    });

    it('should handle database errors during login', async () => {
      const { req, res, next } = createMockReqRes();
      req.body = { email: 'test@example.com', password: 'password' };

      findByCredentialsStub.rejects(new Error('Database error'));

      await require('../src/controllers/auth').login(req, res, next);

      expect(next.calledOnce).to.be.true;
      expect(next.firstCall.args[0]).to.be.instanceOf(Error);
    });
  });

  describe('Controller: auth.js - register', () => {
    it('should create new user and return token on successful registration', async () => {
      const { req, res, next } = createMockReqRes();
      req.body = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        password: 'password123',
      };

      findOneStub.resolves(null);
      const newUser = { ...mockUser, email: 'john.doe@example.com', name: 'John Doe' };
      createStub.resolves(newUser);

      await require('../src/controllers/auth').register(req, res, next);

      expect(findOneStub.calledWith({ email: 'john.doe@example.com' })).to.be.true;
      expect(createStub.calledOnce).to.be.true;
      expect(res.status.calledWith(201)).to.be.true;
      expect(res.status().send.calledOnce).to.be.true;
      expect(res.status().send.firstCall.args[0]).to.have.property('token');
      expect(res.status().send.firstCall.args[0]).to.have.property('user');
    });

    it('should normalize email to lowercase and trim', async () => {
      const { req, res, next } = createMockReqRes();
      req.body = {
        firstName: 'John',
        lastName: 'Doe',
        email: '  JOHN.DOE@EXAMPLE.COM  ',
        password: 'password123',
      };

      findOneStub.resolves(null);
      createStub.resolves(mockUser);

      await require('../src/controllers/auth').register(req, res, next);

      expect(createStub.firstCall.args[0]).to.have.property('email', 'john.doe@example.com');
    });

    it('should create user with full name from firstName and lastName', async () => {
      const { req, res, next } = createMockReqRes();
      req.body = {
        firstName: '  John  ',
        lastName: '  Doe  ',
        email: 'john@example.com',
        password: 'password123',
      };

      findOneStub.resolves(null);
      createStub.resolves(mockUser);

      await require('../src/controllers/auth').register(req, res, next);

      expect(createStub.firstCall.args[0]).to.have.property('name', 'John Doe');
    });

    it('should return 409 if email already exists', async () => {
      const { req, res, next } = createMockReqRes();
      req.body = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'existing@example.com',
        password: 'password123',
      };

      findOneStub.resolves({ email: 'existing@example.com' });

      await require('../src/controllers/auth').register(req, res, next);

      expect(next.calledOnce).to.be.true;
      expect(next.firstCall.args[0]).to.be.instanceOf(ApiError);
      expect(next.firstCall.args[0].statusCode).to.equal(409);
      expect(next.firstCall.args[0].message).to.equal('Ya existe una cuenta con este correo electrónico.');
    });

    it('should handle errors during registration', async () => {
      const { req, res, next } = createMockReqRes();
      req.body = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        password: 'password123',
      };

      findOneStub.rejects(new Error('Database error'));

      await require('../src/controllers/auth').register(req, res, next);

      expect(next.calledOnce).to.be.true;
      expect(next.firstCall.args[0]).to.be.instanceOf(Error);
    });

    it('should assign admin role if email is in ADMIN_EMAILS', async () => {
      const { req, res, next } = createMockReqRes();
      req.body = {
        firstName: 'Admin',
        lastName: 'User',
        email: 'darelisbatistag@gmail.com',
        password: 'password123',
      };

      findOneStub.resolves(null);
      const newUser = {
        _id: 'new-admin-id',
        email: 'darelisbatistag@gmail.com',
        name: 'Admin User',
        role: 'user',
        password: 'hashed-password',
        isAdmin() { return true; },
        save: sinon.stub().resolves(),
      };
      createStub.resolves(newUser);

      await require('../src/controllers/auth').register(req, res, next);

      expect(newUser.save.calledOnce).to.be.true;
      expect(newUser.role).to.equal('admin');
    });
  });

  describe('Controller: auth.js - logout', () => {
    it('should clear session cookie', async () => {
      const { req, res } = createMockReqRes();
      req.headers = {};

      await require('../src/controllers/auth').logout(req, res);

      expect(res.clearCookie.calledOnce).to.be.true;
      expect(res.clearCookie.firstCall.args[0]).to.equal('lamar_token');
      expect(res.status.calledWith(204)).to.be.true;
      expect(res.status().send.calledOnce).to.be.true;
    });

    it('should clear cookie with correct options', async () => {
      const { req, res } = createMockReqRes();
      req.headers = {};
      req.secure = false;
      req.headers['x-forwarded-proto'] = 'http';

      await require('../src/controllers/auth').logout(req, res);

      expect(res.clearCookie.calledOnce).to.be.true;
      expect(res.clearCookie.firstCall.args[0]).to.equal('lamar_token');
      expect(res.clearCookie.firstCall.args[1]).to.deep.equal({
        httpOnly: true, sameSite: 'lax', secure: false, path: '/',
      });
    });

    it('should clear the HTTPS cookie behind nginx using the same scope as login', async () => {
      const { req, res, next } = createMockReqRes();
      req.headers['x-forwarded-proto'] = 'https';
      req.body = { email: 'test@example.com', password: 'password' };
      findByCredentialsStub.resolves(mockUser);

      const { login, logout } = require('../src/controllers/auth');
      await login(req, res, next);
      await logout(req, res);

      expect(res.cookie.firstCall.args[2].secure).to.be.true;
      expect(res.clearCookie.firstCall.args).to.deep.equal([
        res.cookie.firstCall.args[0], res.cookie.firstCall.args[2],
      ]);
    });
  });
});

describe('Session Cookie Helper', () => {
  it('SESSION_COOKIE should be exported', () => {
    expect(authMiddleware.SESSION_COOKIE).to.equal('lamar_token');
  });
});
