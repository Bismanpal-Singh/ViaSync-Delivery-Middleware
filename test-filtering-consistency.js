const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/delivery';

// Test with June 7, 2025
const TEST_DATE = '2025-06-07';

async function testFilteringConsistency() {
  console.log('🧪 Testing filtering consistency between endpoints...\n');
  console.log(`🎯 Testing with date: ${TEST_DATE}\n`);

  try {
    // Test 1: GET /api/delivery/pending
    console.log('1️⃣ Testing GET /api/delivery/pending...');
    const pendingResponse = await axios.get(`${BASE_URL}/pending?date=${TEST_DATE}`);
    const pendingDeliveries = pendingResponse.data;
    console.log(`   ✅ Found ${pendingDeliveries.length} pending deliveries`);
    
    if (pendingDeliveries.length > 0) {
      console.log('   📋 First delivery:', {
        id: pendingDeliveries[0].id,
        address: pendingDeliveries[0].address
      });
    }

    // Test 2: POST /api/delivery/optimize-from-database (with date parameter)
    console.log('\n2️⃣ Testing POST /api/delivery/optimize-from-database with date parameter...');
    const optimizeResponse = await axios.post(`${BASE_URL}/optimize-from-database`, {
      date: TEST_DATE,
      numVehicles: 1,
      limit: 200
    });
    
    if (optimizeResponse.data.success) {
      console.log(`   ✅ Optimization successful with ${optimizeResponse.data.data.routes.length} routes`);
      const totalDeliveryStops = optimizeResponse.data.data.routes.reduce((acc, route) => {
        // Count only delivery stops (exclude depot which has locationId: 'depot')
        const deliveryStops = route.stops.filter(stop => stop.locationId !== 'depot');
        return acc + deliveryStops.length;
      }, 0);
      console.log(`   📦 Total delivery stops processed: ${totalDeliveryStops}`);
      
      // Verify the number of deliveries matches
      if (totalDeliveryStops === pendingDeliveries.length) {
        console.log('   🎯 PERFECT! Both endpoints processed the same number of deliveries');
      } else {
        console.log(`   ⚠️  MISMATCH! Pending: ${pendingDeliveries.length}, Optimized: ${totalDeliveryStops}`);
      }
    } else {
      console.log('   ❌ Optimization failed:', optimizeResponse.data.error);
    }

    // Test 3: POST /api/delivery/optimize-from-database (with fromDate/toDate parameters)
    console.log('\n3️⃣ Testing POST /api/delivery/optimize-from-database with fromDate/toDate...');
    const optimizeResponse2 = await axios.post(`${BASE_URL}/optimize-from-database`, {
      fromDate: TEST_DATE,
      toDate: TEST_DATE,
      numVehicles: 1,
      limit: 200
    });
    
    if (optimizeResponse2.data.success) {
      console.log(`   ✅ Optimization successful with ${optimizeResponse2.data.data.routes.length} routes`);
      const totalDeliveryStops2 = optimizeResponse2.data.data.routes.reduce((acc, route) => {
        // Count only delivery stops (exclude depot which has locationId: 'depot')
        const deliveryStops = route.stops.filter(stop => stop.locationId !== 'depot');
        return acc + deliveryStops.length;
      }, 0);
      console.log(`   📦 Total delivery stops processed: ${totalDeliveryStops2}`);
      
      // Verify the number of deliveries matches
      if (totalDeliveryStops2 === pendingDeliveries.length) {
        console.log('   🎯 PERFECT! Both endpoints processed the same number of deliveries');
      } else {
        console.log(`   ⚠️  MISMATCH! Pending: ${pendingDeliveries.length}, Optimized: ${totalDeliveryStops2}`);
      }
    } else {
      console.log('   ❌ Optimization failed:', optimizeResponse2.data.error);
    }

    console.log('\n🎯 Summary:');
    console.log(`   - GET /pending found ${pendingDeliveries.length} deliveries on ${TEST_DATE}`);
    console.log(`   - Both optimization methods should process the same deliveries`);
    console.log(`   - Check the server logs to confirm filtering consistency`);

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testFilteringConsistency(); 