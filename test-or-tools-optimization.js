const axios = require('axios');

// Test scenarios for route optimization
const testScenarios = [
  {
    name: "Basic 3 Deliveries, 2 Vehicles",
    data: {
        depotAddress: {
            address: "456 Flower Shop, San Francisco, CA 94103",
            timeWindow: { start: "08:00", end: "18:00" } // or wider
          },          
      deliveries: [
        {
          id: "delivery-1",
          address: "123 Main St, San Francisco, CA 94102",
          timeWindow: { start: "09:00", end: "12:00" }
        },
        {
          id: "delivery-2", 
          address: "789 Oak Ave, San Francisco, CA 94105",
          timeWindow: { start: "13:00", end: "16:00" }
        },
        {
          id: "delivery-3",
          address: "321 Pine St, San Francisco, CA 94104", 
          timeWindow: { start: "10:00", end: "14:00" }
        }
      ],
      numVehicles: 2
    }
  },
  {
    name: "Single Vehicle, Multiple Deliveries",
    data: {
        depotAddress: {
            address: "456 Flower Shop, San Francisco, CA 94103",
            timeWindow: { start: "08:00", end: "18:00" } // or wider
          },
          
      deliveries: [
        {
          id: "delivery-1",
          address: "123 Main St, San Francisco, CA 94102",
          timeWindow: { start: "09:00", end: "11:00" }
        },
        {
          id: "delivery-2", 
          address: "789 Oak Ave, San Francisco, CA 94105",
          timeWindow: { start: "11:30", end: "13:30" }
        },
        {
          id: "delivery-3",
          address: "321 Pine St, San Francisco, CA 94104", 
          timeWindow: { start: "14:00", end: "16:00" }
        },
        {
          id: "delivery-4",
          address: "555 Market St, San Francisco, CA 94108", 
          timeWindow: { start: "16:30", end: "18:30" }
        }
      ],
      numVehicles: 1
    }
  },
  {
    name: "Multiple Vehicles, Overlapping Time Windows",
    data: {
        depotAddress: {
            address: "456 Flower Shop, San Francisco, CA 94103",
            timeWindow: { start: "08:00", end: "18:00" } // or wider
          },          
      deliveries: [
        {
          id: "delivery-1",
          address: "123 Main St, San Francisco, CA 94102",
          timeWindow: { start: "09:00", end: "10:00" }
        },
        {
          id: "delivery-2", 
          address: "789 Oak Ave, San Francisco, CA 94105",
          timeWindow: { start: "09:30", end: "10:30" }
        },
        {
          id: "delivery-3",
          address: "321 Pine St, San Francisco, CA 94104", 
          timeWindow: { start: "10:00", end: "11:00" }
        },
        {
          id: "delivery-4",
          address: "555 Market St, San Francisco, CA 94108", 
          timeWindow: { start: "10:30", end: "11:30" }
        },
        {
          id: "delivery-5",
          address: "777 Castro St, San Francisco, CA 94114", 
          timeWindow: { start: "11:00", end: "12:00" }
        }
      ],
      numVehicles: 3
    }
  }
];

// Validation functions
function validateOptimizationResult(result, scenario) {
  const issues = [];
  
  // Check if all deliveries are assigned
  const assignedDeliveries = new Set();
  result.routes.forEach(route => {
    route.stops.forEach(stop => {
      if (stop.locationId !== 'depot') {
        assignedDeliveries.add(stop.locationId);
      }
    });
  });
  
  const expectedDeliveries = new Set(scenario.deliveries.map(d => d.id));
  const missingDeliveries = [...expectedDeliveries].filter(id => !assignedDeliveries.has(id));
  const extraDeliveries = [...assignedDeliveries].filter(id => !expectedDeliveries.has(id));
  
  if (missingDeliveries.length > 0) {
    issues.push(`Missing deliveries: ${missingDeliveries.join(', ')}`);
  }
  
  if (extraDeliveries.length > 0) {
    issues.push(`Extra deliveries: ${extraDeliveries.join(', ')}`);
  }
  
  // Check vehicle count
  if (result.numVehiclesUsed > scenario.numVehicles) {
    issues.push(`Too many vehicles used: ${result.numVehiclesUsed} > ${scenario.numVehicles}`);
  }
  
  // Check route structure
  result.routes.forEach((route, index) => {
    if (route.stops.length < 2) {
      issues.push(`Route ${index + 1} has insufficient stops: ${route.stops.length}`);
    }
    
    // Check if route starts and ends at depot
    if (route.stops[0].locationId !== 'depot') {
      issues.push(`Route ${index + 1} doesn't start at depot`);
    }
    
    if (route.stops[route.stops.length - 1].locationId !== 'depot') {
      issues.push(`Route ${index + 1} doesn't end at depot`);
    }
  });
  
  // Check time windows
  result.routes.forEach((route, routeIndex) => {
    route.stops.forEach((stop, stopIndex) => {
      if (stop.locationId !== 'depot') {
        const delivery = scenario.deliveries.find(d => d.id === stop.locationId);
        if (delivery) {
          const etaMinutes = timeToMinutes(stop.eta);
          const windowStart = timeToMinutes(delivery.timeWindow.start);
          const windowEnd = timeToMinutes(delivery.timeWindow.end);
          
          if (etaMinutes < windowStart || etaMinutes > windowEnd) {
            issues.push(`Route ${routeIndex + 1}, Stop ${stopIndex + 1}: ETA ${stop.eta} outside window ${delivery.timeWindow.start}-${delivery.timeWindow.end}`);
          }
        }
      }
    });
  });
  
  return issues;
}

function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

// Main test function
async function runOptimizationTests() {
  console.log('🚚 OR-Tools Route Optimization Test Suite');
  console.log('=' .repeat(80));
  
  // Test server health first
  try {
    console.log('🏥 Testing server health...');
    const healthResponse = await axios.get('http://localhost:3000/api/delivery/health');
    console.log('✅ Server health:', healthResponse.data.data);
    console.log('');
  } catch (error) {
    console.error('❌ Server health check failed:', error.message);
    console.log('💡 Make sure your server is running: npm run dev');
    return;
  }
  
  let totalTests = 0;
  let passedTests = 0;
  
  // Run each test scenario
  for (const scenario of testScenarios) {
    totalTests++;
    console.log(`🧪 Test ${totalTests}: ${scenario.name}`);
    console.log('-'.repeat(60));
    
    try {
      // Display test data
      console.log(`📍 Depot: ${scenario.data.depotAddress}`);
      console.log(`🚗 Vehicles: ${scenario.data.numVehicles}`);
      console.log(`📦 Deliveries:`);
      scenario.data.deliveries.forEach((delivery, index) => {
        console.log(`   ${index + 1}. ${delivery.address} (${delivery.timeWindow.start}-${delivery.timeWindow.end})`);
      });
      console.log('');
      
      // Call optimization API
      console.log('🔄 Calling optimization API...');
      const startTime = Date.now();
      const response = await axios.post('http://localhost:3000/api/delivery/optimize', scenario.data);
      const endTime = Date.now();
      
      console.log(`✅ Optimization completed in ${endTime - startTime}ms`);
      console.log('');
      
      // Display results
      const result = response.data.data;
      console.log('📊 OPTIMIZATION RESULTS:');
      console.log(`   Total Routes: ${result.routes.length}`);
      console.log(`   Vehicles Used: ${result.numVehiclesUsed}/${scenario.data.numVehicles}`);
      console.log(`   Total Distance: ${result.totalDistance.toFixed(2)} km`);
      console.log(`   Total Time: ${formatDuration(result.totalTime)}`);
      console.log('');
      
      // Display each route
      result.routes.forEach((route, index) => {
        console.log(`🚗 Route ${index + 1} (Vehicle ${route.vehicleId}):`);
        console.log(`   Distance: ${route.totalDistance.toFixed(2)} km`);
        console.log(`   Time: ${formatDuration(route.totalTime)}`);
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
      
      // Validate results
      console.log('🔍 VALIDATION:');
      const validationIssues = validateOptimizationResult(result, scenario);
      
      if (validationIssues.length === 0) {
        console.log('✅ All validations passed!');
        passedTests++;
      } else {
        console.log('❌ Validation issues found:');
        validationIssues.forEach(issue => console.log(`   - ${issue}`));
      }
      
    } catch (error) {
      console.error('❌ Test failed:', error.response?.data || error.message);
    }
    
    console.log('=' .repeat(80));
    console.log('');
  }
  
  // Summary
  console.log('📋 TEST SUMMARY:');
  console.log(`   Total Tests: ${totalTests}`);
  console.log(`   Passed: ${passedTests}`);
  console.log(`   Failed: ${totalTests - passedTests}`);
  console.log(`   Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! Your OR-Tools optimization is working correctly.');
  } else {
    console.log('⚠️ Some tests failed. Check the issues above.');
  }
}

// Run the tests
runOptimizationTests().catch(error => {
  console.error('❌ Test suite failed:', error.message);
}); 