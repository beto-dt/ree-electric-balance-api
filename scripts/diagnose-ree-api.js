/**
 * @file diagnose-ree-api.js
 * @description Script para diagnosticar problemas con la API de REE y la inserción en MongoDB
 */

const axios = require('axios');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Importar el modelo
const ElectricBalanceModel = require('../src/infrastructure/database/models/ElectricBalanceModel');
const ElectricBalance = require('../src/domain/entities/ElectricBalance');

// Configuración
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/electric-balance';
const REE_API_URL = 'https://apidatos.ree.es/es/datos/balance/balance-electrico';
const TEST_DATE = '2020-11-11';

async function diagnose() {
  console.log('====== DIAGNÓSTICO DE INTEGRACIÓN CON API REE ======');

  try {
    // Paso 1: Probar conexión a MongoDB
    console.log('\n[PASO 1] Probando conexión a MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Conexión a MongoDB exitosa');

    // Paso 2: Verificar estructura del modelo
    console.log('\n[PASO 2] Verificando estructura del modelo...');
    const modelFields = Object.keys(ElectricBalanceModel.schema.paths);
    console.log('Campos del modelo:', modelFields.join(', '));

    // Paso 3: Obtener datos de la API de REE
    console.log('\n[PASO 3] Obteniendo datos de la API de REE...');
    const apiResponse = await axios.get(REE_API_URL, {
      params: {
        start_date: `${TEST_DATE}T00:00`,
        end_date: `${TEST_DATE}T23:59`,
        time_trunc: 'day'
      }
    });

    console.log('✅ Datos obtenidos de la API');
    console.log(`Datos recibidos: ${JSON.stringify(apiResponse.data).length} bytes`);

    // Guardar la respuesta para análisis
    const responseFile = 'api_response.json';
    fs.writeFileSync(responseFile, JSON.stringify(apiResponse.data, null, 2));
    console.log(`Respuesta guardada en ${responseFile}`);

    // Paso 4: Analizar estructura de la respuesta
    console.log('\n[PASO 4] Analizando estructura de la respuesta...');

    if (!apiResponse.data.data) {
      throw new Error('La respuesta no tiene la estructura esperada (no hay data)');
    }

    if (!apiResponse.data.included || !Array.isArray(apiResponse.data.included)) {
      console.warn('⚠️ La respuesta no tiene la sección "included" o no es un array');
    } else {
      console.log(`La sección "included" contiene ${apiResponse.data.included.length} elementos`);

      // Verificar tipos de elementos en included
      const types = apiResponse.data.included.map(item => item.type);
      console.log('Tipos en included:', [...new Set(types)].join(', '));

      // Verificar si hay datos de generación, demanda e intercambio
      const hasGeneration = apiResponse.data.included.some(item => item.type === 'generation');
      const hasDemand = apiResponse.data.included.some(item => item.type === 'demand');
      const hasInterchange = apiResponse.data.included.some(item => item.type === 'interchange');

      console.log(`Datos disponibles: generación=${hasGeneration}, demanda=${hasDemand}, intercambio=${hasInterchange}`);
    }

    // Paso 5: Intentar crear una entidad de balance eléctrico
    console.log('\n[PASO 5] Creando entidad de balance eléctrico...');

    let electricBalance;
    try {
      electricBalance = ElectricBalance.fromREEApiResponse(apiResponse.data);
      console.log('✅ Entidad creada correctamente');
      console.log(`Timestamp: ${electricBalance.timestamp}`);
      console.log(`TimeScope: ${electricBalance.timeScope}`);
      console.log(`Elementos de generación: ${electricBalance.generation.length}`);
      console.log(`Elementos de demanda: ${electricBalance.demand.length}`);
      console.log(`Elementos de intercambio: ${electricBalance.interchange.length}`);

      // Guardar entidad para análisis
      fs.writeFileSync('entity.json', JSON.stringify(electricBalance, null, 2));

      if (electricBalance.generation.length === 0 &&
        electricBalance.demand.length === 0 &&
        electricBalance.interchange.length === 0) {
        console.warn('⚠️ ALERTA: La entidad no contiene datos');

        // Intentar extraer datos manualmente
        console.log('\n[PASO 5.1] Intentando extraer datos manualmente...');

        // Buscar en included
        if (apiResponse.data.included) {
          for (const item of apiResponse.data.included) {
            if (item.type && item.attributes && item.attributes.content) {
              console.log(`Encontrados ${item.attributes.content.length} elementos en ${item.type}`);

              // Mostrar ejemplo
              if (item.attributes.content.length > 0) {
                console.log('Ejemplo:', JSON.stringify(item.attributes.content[0], null, 2));
              }
            }
          }
        }

        // Ver si hay valores alternativos
        if (apiResponse.data.data.attributes && apiResponse.data.data.attributes.values) {
          console.log(`Encontrados ${apiResponse.data.data.attributes.values.length} valores en data.attributes.values`);
        }
      }
    } catch (error) {
      console.error('❌ Error al crear la entidad:', error.message);
      throw error;
    }

    // Paso 6: Verificar si existen registros similares
    console.log('\n[PASO 6] Verificando registros existentes...');

    const existingCount = await ElectricBalanceModel.countDocuments({
      timestamp: {
        $gte: new Date(`${TEST_DATE}T00:00:00Z`),
        $lte: new Date(`${TEST_DATE}T23:59:59Z`)
      }
    });

    console.log(`Registros existentes para ${TEST_DATE}: ${existingCount}`);

    if (existingCount > 0) {
      console.log('Detalles de los registros existentes:');

      const existingRecords = await ElectricBalanceModel.find({
        timestamp: {
          $gte: new Date(`${TEST_DATE}T00:00:00Z`),
          $lte: new Date(`${TEST_DATE}T23:59:59Z`)
        }
      }).limit(5);

      existingRecords.forEach((record, i) => {
        console.log(`Registro ${i+1}:`);
        console.log(`- ID: ${record._id}`);
        console.log(`- Timestamp: ${record.timestamp}`);
        console.log(`- TimeScope: ${record.timeScope}`);
        console.log(`- Elementos: generation=${record.generation.length}, demand=${record.demand.length}, interchange=${record.interchange.length}`);
        console.log(`- Creado: ${record.createdAt}`);
      });
    }

    // Paso 7: Intentar insertar un registro de prueba
    console.log('\n[PASO 7] Insertando registro de prueba...');

    // Crear objeto para inserción directa sin pasar por la entidad
    const directTestData = {
      timestamp: new Date(`${TEST_DATE}T12:00:00Z`),
      timeScope: 'day',
      generation: [
        {
          type: 'TEST_GENERATION',
          value: 100,
          percentage: 50,
          color: '#FF0000',
          unit: 'MW'
        }
      ],
      demand: [
        {
          type: 'TEST_DEMAND',
          value: 200,
          percentage: 100,
          color: '#00FF00',
          unit: 'MW'
        }
      ],
      interchange: [
        {
          type: 'TEST_INTERCHANGE',
          value: 50,
          percentage: 25,
          color: '#0000FF',
          unit: 'MW'
        }
      ],
      metadata: {
        title: 'Test Insert',
        description: 'Registro de prueba para diagnóstico',
        source: 'Diagnóstico'
      }
    };

    try {
      const testRecord = new ElectricBalanceModel(directTestData);
      await testRecord.save();
      console.log('✅ Registro de prueba insertado correctamente');
      console.log(`ID del registro: ${testRecord._id}`);
    } catch (error) {
      console.error('❌ Error al insertar registro de prueba:', error.message);
      console.error('Detalles del error:', error);
    }

    // Paso 8: Verificar hook pre-save
    console.log('\n[PASO 8] Verificando funcionamiento del hook pre-save...');

    try {
      const record = await ElectricBalanceModel.findOne({
        'metadata.title': 'Test Insert'
      });

      if (record) {
        console.log('Pre-save hook resultados:');
        console.log(`- Total Generation: ${record.totalGeneration} (esperado: 100)`);
        console.log(`- Total Demand: ${record.totalDemand} (esperado: 200)`);
        console.log(`- Balance: ${record.balance} (esperado: -100)`);
        console.log(`- Renewable Percentage: ${record.renewablePercentage}`);
      } else {
        console.warn('⚠️ No se encontró el registro de prueba');
      }
    } catch (error) {
      console.error('❌ Error al verificar hook pre-save:', error.message);
    }

    // Paso 9: Intentar actualizar un registro existente
    console.log('\n[PASO 9] Probando actualización de registros...');

    try {
      const updateResult = await ElectricBalanceModel.updateOne(
        { 'metadata.title': 'Test Insert' },
        {
          $set: {
            'metadata.description': 'Registro actualizado durante diagnóstico'
          }
        }
      );

      console.log('Resultado de actualización:', updateResult);

      if (updateResult.modifiedCount > 0) {
        console.log('✅ Registro actualizado correctamente');
      } else if (updateResult.matchedCount > 0) {
        console.log('⚠️ Registro encontrado pero no modificado');
      } else {
        console.warn('⚠️ No se encontró el registro para actualizar');
      }
    } catch (error) {
      console.error('❌ Error al actualizar registro:', error.message);
    }

    // Paso 10: Probar el método fromREEApiResponse
    console.log('\n[PASO 10] Probando método fromREEApiResponse con datos de prueba...');

    // Crear un objeto de prueba que imite la estructura de la respuesta de la API
    const mockApiResponse = {
      data: {
        id: 'test-id',
        type: 'test-type',
        attributes: {
          title: 'Test Response',
          datetime: `${TEST_DATE}T12:00:00Z`,
          'time-trunc': 'day'
        }
      },
      included: [
        {
          id: 'gen-id',
          type: 'generation',
          attributes: {
            content: [
              {
                type: 'MOCK_GENERATION',
                value: 150,
                percentage: 75,
                color: '#FF00FF'
              }
            ]
          }
        },
        {
          id: 'dem-id',
          type: 'demand',
          attributes: {
            content: [
              {
                type: 'MOCK_DEMAND',
                value: 300,
                percentage: 100,
                color: '#00FFFF'
              }
            ]
          }
        }
      ]
    };

    try {
      const mockEntity = ElectricBalance.fromREEApiResponse(mockApiResponse);
      console.log('✅ Entidad creada desde datos de prueba');
      console.log(`Generación: ${mockEntity.generation.length} elementos`);
      console.log(`Demanda: ${mockEntity.demand.length} elementos`);

      if (mockEntity.generation.length === 0 || mockEntity.demand.length === 0) {
        console.error('❌ El método no extrajo correctamente los datos');
      }
    } catch (error) {
      console.error('❌ Error al crear entidad desde datos de prueba:', error.message);
      console.error('Detalles:', error);
    }

    console.log('\n====== DIAGNÓSTICO COMPLETADO ======');
    console.log('Revisa los resultados para identificar el problema');

  } catch (error) {
    console.error('\n❌ ERROR EN EL DIAGNÓSTICO:', error.message);
    console.error('Detalles del error:', error);
  } finally {
    // Cerrar conexión a MongoDB
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('\nConexión a MongoDB cerrada');
    }
  }
}

// Ejecutar diagnóstico
diagnose();
