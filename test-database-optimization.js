const axios = require('axios');

// Test database optimization with real delivery data
async function testDatabaseOptimization() {
  console.log('🚚 Testing Database Route Optimization');
  console.log('=' .repeat(60));
  
  try {
    // Test server health first
    console.log('🏥 Testing server health...');
    const healthResponse = await axios.get('http://localhost:3000/api/delivery/health');
    console.log('✅ Server health:', healthResponse.data.data.status);
    console.log('');
    
    // Test with just 2 deliveries to see time windows
    console.log('🧪 Testing with 2 deliveries to check time windows...');
    const testData = {
      numVehicles: 1,
      fromDate: '2025-01-01',
      toDate: '2025-12-31',
      limit: 2
    };
    
    console.log('📊 Test parameters:', testData);
    console.log('');
    
    const startTime = Date.now();
    const response = await axios.post(
      'http://localhost:3000/api/delivery/optimize-from-database',
      testData
    );
    const endTime = Date.now();
    
    console.log(`✅ Optimization completed in ${endTime - startTime}ms`);
    console.log('');
    
    // Display results
    const result = response.data.data;
    console.log('📊 OPTIMIZATION RESULTS:');
    console.log(`   Total Routes: ${result.routes.length}`);
    console.log(`   Vehicles Used: ${result.numVehiclesUsed}/${testData.numVehicles}`);
    console.log(`   Total Distance: ${result.totalDistance.toFixed(2)} km`);
    console.log(`   Total Time: ${Math.floor(result.totalTime / 60)}h ${result.totalTime % 60}m`);
    console.log('');
    
    // Display each route
    result.routes.forEach((route, index) => {
      console.log(`🚗 Route ${index + 1} (Vehicle ${route.vehicleId}):`);
      console.log(`   Distance: ${route.totalDistance.toFixed(2)} km`);
      console.log(`   Time: ${Math.floor(route.totalTime / 60)}h ${route.totalTime % 60}m`);
      console.log(`   Stops: ${route.stops.length}`);
      
      route.stops.forEach((stop, stopIndex) => {
        if (stop.locationId === 'depot') {
          console.log(`   ${stopIndex + 1}. 🏪 DEPOT: ${stop.address} (ETA: ${stop.eta})`);
        } else {
          console.log(`   ${stopIndex + 1}. 📦 Delivery ${stop.locationId}: ${stop.address} (ETA: ${stop.eta})`);
        }
      });
      console.log('');
    });
    
    console.log('✅ Database optimization test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 500) {
      console.log('💡 This might be due to:');
      console.log('   - No deliveries found with the specified criteria');
      console.log('   - Geocoding issues with delivery addresses');
      console.log('   - OR-Tools solver constraints');
    }
  }
}

// Run the test
testDatabaseOptimization(); 