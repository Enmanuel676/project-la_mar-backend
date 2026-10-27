// Script de prueba: simula el flujo completo de un navegador
// 1. Registrar usuario nuevo → obtener token
// 2. GET /api/users/me con el token
// 3. GET /api/users con el token (verificar admin)
// 4. GET /api/articles con el token
// 5. Simular "otra pestaña" con el mismo token

const BASE = 'http://localhost:3000/api';

async function test() {
  const email = 'test-' + Date.now() + '@lamar.com';
  const password = 'TestPass123!';
  const firstName = 'Test';
  const lastName = 'Session';
  
  console.log('=== PRUEBA DE SESIÓN COMPLETA ===\n');
  console.log('Usuario de prueba:', email);
  
  // 1. REGISTRAR
  console.log('\n1. POST /api/auth/register...');
  const regRes = await fetch(BASE + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName, lastName, email, password }),
  });
  const regData = await regRes.json();
  console.log('   Status:', regRes.status);
  
  if (regRes.status !== 201) {
    console.log('   ❌ Registro falló:', JSON.stringify(regData));
    // Si el registro falla, intentar login con usuario existente
    console.log('\n   Intentando login con enmanuel676hd@gmail.com...');
    const loginRes = await fetch(BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'enmanuel676hd@gmail.com', password: 'Admin1234' }),
    });
    const loginData = await loginRes.json();
    console.log('   Login status:', loginRes.status);
    if (loginRes.status !== 200) {
      console.log('   ❌ Login también falló. No puedo probar sin credenciales válidas.');
      console.log('   Respuesta:', JSON.stringify(loginData));
      return;
    }
    var token = loginData.token;
    var user = loginData.user;
  } else {
    console.log('   ✅ Registro exitoso');
    var token = regData.token;
    var user = regData.user;
  }
  
  console.log('   Token:', token.substring(0, 40) + '...');
  console.log('   User:', JSON.stringify(user));
  
  // 2. GET /api/users/me
  console.log('\n2. GET /api/users/me (con token)...');
  const meRes = await fetch(BASE + '/users/me', {
    headers: { 'Authorization': 'Bearer ' + token },
  });
  const meData = await meRes.json();
  console.log('   Status:', meRes.status);
  console.log('   Response:', JSON.stringify(meData, null, 2));
  
  if (meRes.status === 200) {
    console.log('   ✅ /users/me funciona correctamente');
  } else {
    console.log('   ❌ /users/me falló:', meData.message);
  }
  
  // 3. GET /api/users (solo admin)
  console.log('\n3. GET /api/users (con token, requiere admin)...');
  const usersRes = await fetch(BASE + '/users', {
    headers: { 'Authorization': 'Bearer ' + token },
  });
  const usersData = await usersRes.json();
  console.log('   Status:', usersRes.status);
  if (usersRes.status === 200) {
    console.log('   ✅ /users funciona (es admin)');
    if (Array.isArray(usersData)) {
      usersData.forEach(u => console.log('     -', u.email, '|', u.name, '| role:', u.role));
    }
  } else {
    console.log('   Response:', JSON.stringify(usersData));
    if (usersRes.status === 403) {
      console.log('   ⚠️  /users dio 403 (usuario no es admin)');
    } else {
      console.log('   ❌ /users falló:', usersData.message);
    }
  }
  
  // 4. GET /api/articles
  console.log('\n4. GET /api/articles (con token)...');
  const articlesRes = await fetch(BASE + '/articles', {
    headers: { 'Authorization': 'Bearer ' + token },
  });
  const articlesData = await articlesRes.json();
  console.log('   Status:', articlesRes.status);
  if (articlesRes.status === 200) {
    console.log('   ✅ /articles funciona, artículos:', Array.isArray(articlesData) ? articlesData.length : 'N/A');
  } else {
    console.log('   ❌ /articles falló:', JSON.stringify(articlesData));
  }
  
  // 5. GET /api/users/me SIN token (debe dar 401)
  console.log('\n5. GET /api/users/me (SIN token, debe dar 401)...');
  const noAuthRes = await fetch(BASE + '/users/me');
  const noAuthData = await noAuthRes.json();
  console.log('   Status:', noAuthRes.status, '| Message:', noAuthData.message);
  
  // 6. Simular "otra pestaña": mismo token, nueva petición
  console.log('\n6. Simulando OTRA PESTAÑA (mismo token)...');
  const meRes2 = await fetch(BASE + '/users/me', {
    headers: { 'Authorization': 'Bearer ' + token },
  });
  const meData2 = await meRes2.json();
  console.log('   Status:', meRes2.status);
  if (meRes2.status === 200) {
    console.log('   ✅ La "otra pestaña" accede correctamente con el mismo token');
    console.log('   name:', meData2.name, '| email:', meData2.email);
  } else {
    console.log('   ❌ Falló:', JSON.stringify(meData2));
  }
  
  // 7. Verificar que el token es el mismo (localStorage compartiría esto)
  console.log('\n7. Verificación de persistencia del token...');
  console.log('   El token en esta "pestaña" es:', token.substring(0, 40) + '...');
  console.log('   En localStorage estaría guardado bajo "lamar_token"');
  console.log('   Todas las pestañas leerían el mismo valor de localStorage');
  
  console.log('\n=== FIN DE LA PRUEBA ===');
}

test().catch(err => {
  console.error('Error fatal:', err.message);
  process.exit(1);
});
