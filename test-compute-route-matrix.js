require('dotenv').config();
const { DistanceMatrixService } = require('./src/services/DistanceMatrixService');

async function testComputeRouteMatrix() {
  const service = new DistanceMatrixService();

  // Generate up to 10 random locations around a base point (for demo; increase to 25 if you want)
  const baseLat = 34.7465;
  const baseLon = -92.2896;
  const locations = [];
  for (let i = 0; i < 10; i++) {
    const lat = baseLat + (Math.random() - 0.5) * 0.1;
    const lon = baseLon + (Math.random() - 0.5) * 0.1;
    locations.push({
      lat,
      lon,
      type: 'order',
      orderId: i + 1
    });
  }

  console.log(`🧪 Testing Compute Route Matrix API with ${locations.length} locations...`);
  const result = await service.getDistanceMatrix(locations);
  if (!result) {
    console.error('❌ Failed to get distance matrix');
    return;
  }

  console.log('✅ Distance matrix (seconds):');
  console.table(result.matrix);
  console.log('✅ Distance matrix (meters):');
  console.table(result.distances);
}

testComputeRouteMatrix().catch(console.error); 