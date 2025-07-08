const axios = require('axios');

// Test data for route optimization
const testData = {
  depotAddress: "456 Flower Shop, San Francisco, CA 94103",
  deliveries: [
    {
      id: "delivery-1",
      address: "123 Main St, San Francisco, CA 94102",
      timeWindow: {
        start: "09:00",
        end: "12:00"
      }
    },
    {
      id: "delivery-2", 
      address: "789 Oak Ave, San Francisco, CA 94105",
      timeWindow: {
        start: "13:00",
        end: "16:00"
      }
    },
    {
      id: "delivery-3",
      address: "321 Pine St, San Francisco, CA 94104", 
      timeWindow: {
        start: "10:00",
        end: "14:00"
      }
    }
  ],
  numVehicles: 2
};

async function testOptimization() {
  try {
    console.log('🚚 Testing Route Optimization with Google OR-Tools');
    console.log('=' .repeat(60));
    
    console.log('📍 Depot:', testData.depotAddress);
    console.log('📦 Deliveries:');
    testData.deliveries.forEach((delivery, index) => {
      console.log(`   ${index + 1}. ${delivery.address} (${delivery.timeWindow.start}-${delivery.timeWindow.end})`);
    });
    console.log(`🚗 Vehicles: ${testData.numVehicles}`);
    console.log('');

    // Test health endpoint first
    console.log('🏥 Testing health endpoint...');
    const healthResponse = await axios.get('http://localhost:3000/api/delivery/health');
    console.log('✅ Health check passed:', healthResponse.data.data);
    console.log('');

    // Call the route optimization endpoint
    console.log('🔄 Calling route optimization API...');
    const response = await axios.post('http://localhost:3000/api/delivery/optimize', testData);
    
    console.log('✅ Optimization completed successfully!');
    console.log('');
    
    // Display results
    const result = response.data.data;
    console.log('📊 OPTIMIZATION RESULTS:');
    console.log('=' .repeat(60));
    console.log(`Total Routes: ${result.routes.length}`);
    console.log(`Total Distance: ${(result.totalDistance).toFixed(2)} km`);
    console.log(`Total Time: ${(result.totalTime).toFixed(0)} minutes`);
    console.log(`Vehicles Used: ${result.numVehiclesUsed}`);
    console.log('');

    // Display each route
    result.routes.forEach((route, index) => {
      console.log(`🚗 Route ${index + 1} (Vehicle ${route.vehicleId}):`);
      console.log(`   Total Distance: ${route.totalDistance.toFixed(2)} km`);
      console.log(`   Total Time: ${route.totalTime.toFixed(0)} minutes`);
      console.log(`   Stops: ${route.stops.length}`);
      
      route.stops.forEach((stop, stopIndex) => {
        if (stop.locationId === 'depot') {
          console.log(`   ${stopIndex + 1}. 🏪 DEPOT: ${stop.address} (ETA: ${stop.eta})`);
        } else {
          console.log(`   ${stopIndex + 1}. 📦 ${stop.address} (ETA: ${stop.eta})`);
        }
      });
      console.log('');
    });

    console.log('🎯 Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Make sure your server is running:');
      console.log('   npm run dev');
    }
  }
}

// Run the test
testOptimization(); 