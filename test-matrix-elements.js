require('dotenv').config();
const axios = require('axios');

// Test with different matrix sizes to find the element limit
async function testMatrixElements(origins, destinations) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_MAPS_API_KEY not set');
    return;
  }

  const totalElements = origins * destinations;
  
  // Create test coordinates
  const originCoords = Array(origins).fill("34.7465,-92.2896").join('|');
  const destCoords = Array(destinations).fill("34.7465,-92.2896").join('|');
  
  console.log(`\n🔍 Testing ${origins} origins × ${destinations} destinations = ${totalElements} elements`);
  
  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
      params: {
        origins: originCoords,
        destinations: destCoords,
        departure_time: 'now',
        traffic_model: 'best_guess',
        key: apiKey
      }
    });

    console.log(`✅ Status: ${response.data.status}`);
    if (response.data.status !== 'OK') {
      console.log(`❌ Error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
    } else {
      console.log(`✅ Success! Matrix size: ${response.data.rows.length}x${response.data.rows[0]?.elements?.length || 0}`);
    }
  } catch (error) {
    console.log(`❌ Request failed: ${error.message}`);
  }
}

async function runTests() {
  console.log('🧪 Testing Google Maps Distance Matrix API element limits...');
  
  // Test different matrix configurations
  await testMatrixElements(10, 10);  // 100 elements
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await testMatrixElements(11, 11);  // 121 elements
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await testMatrixElements(10, 11);  // 110 elements
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await testMatrixElements(9, 11);   // 99 elements
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await testMatrixElements(25, 4);   // 100 elements
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await testMatrixElements(25, 5);   // 125 elements
  await new Promise(resolve => setTimeout(resolve, 1000));
}

runTests().catch(console.error); 