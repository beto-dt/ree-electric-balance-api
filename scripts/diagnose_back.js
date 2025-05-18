// diagnose.js
const axios = require('axios');
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

const API_URL = 'http://localhost:4000';
const MONGODB_URI = 'mongodb://localhost:27017/electric-balance';

async function diagnose() {
  console.log('=== DIAGNÓSTICO COMPLETO DE LA APLICACIÓN ===\n');

  try {
    // 1. Verificar que la API está en funcionamiento
    console.log('1. Verificando estado de la API...');
    const healthResponse = await axios.get(`${API_URL}/health`);
    console.log(`   Estado: ${healthResponse.data.status}`);
    console.log(`   MongoDB: ${healthResponse.data.services.mongodb.status}`);

    // 2. Verificar info de la API
    console.log('\n2. Obteniendo información de la API...');
    const infoResponse = await axios.get(`${API_URL}/api-info`);
    console.log(`   Nombre: ${infoResponse.data.name}`);
    console.log(`   Versión: ${infoResponse.data.version}`);
    console.log(`   Endpoint GraphQL: ${infoResponse.data.endpoints.graphql}`);

    // 3. Probar conexión directa a MongoDB
    console.log('\n3. Verificando conexión directa a MongoDB...');
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const dbInfo = await client.db().admin().serverInfo();
    console.log(`   Conectado a MongoDB versión: ${dbInfo.version}`);

    // 4. Verificar colecciones y datos
    console.log('\n4. Verificando colecciones y datos...');
    const collections = await client.db().collections();
    console.log(`   Colecciones disponibles: ${collections.map(c => c.collectionName).join(', ')}`);

    const electricBalancesCount = await client.db().collection('electric_balances').countDocuments();
    console.log(`   Registros de balance eléctrico: ${electricBalancesCount}`);

    await client.close();

    // 5. Probar consulta GraphQL básica
    console.log('\n5. Probando consulta GraphQL básica...');
    try {
      const graphqlResponse = await axios.post(
        `${API_URL}/graphql`,
        { query: '{ latestElectricBalance { timestamp, timeScope, totalGeneration, totalDemand } }' },
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (graphqlResponse.data.errors) {
        console.log('   ❌ Error en consulta GraphQL:');
        console.log(JSON.stringify(graphqlResponse.data.errors, null, 2));
      } else {
        console.log('   ✅ Consulta GraphQL exitosa:');
        console.log(JSON.stringify(graphqlResponse.data.data, null, 2));
      }
    } catch (error) {
      console.log('   ❌ Error al hacer consulta GraphQL:', error.message);
    }

    console.log('\n=== DIAGNÓSTICO COMPLETADO ===');

  } catch (error) {
    console.error('\n❌ ERROR EN DIAGNÓSTICO:', error.message);
    if (error.response) {
      console.error('Detalles:', error.response.data);
    }
  }
}

diagnose();
