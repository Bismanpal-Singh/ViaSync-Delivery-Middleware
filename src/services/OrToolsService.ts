import { spawn } from 'child_process';
import path from 'path';

export interface VRPTWData {
  num_vehicles: number;
  depot: number;
  distance_matrix: number[][];
  time_matrix: number[][];
  time_windows: [number, number][];
  demands?: number[];
}

export interface VRPTWResult {
  routes?: Array<{
    vehicle_id: number;
    route: number[];
    arrival_times?: number[];
    distance: number;
    time: number;
    deliveries: number[];
  }>;
  total_distance?: number;
  total_time?: number;
  num_vehicles_used?: number;
  error?: string;
}

export class OrToolsService {
  private readonly solverPath: string;

  constructor() {
    this.solverPath = path.join(__dirname, '../../python/vrptw_solver.py');
  }

  public async solveVRPTW(data: VRPTWData): Promise<VRPTWResult> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python3', [this.solverPath, JSON.stringify(data)]);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      pythonProcess.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      pythonProcess.on('error', (err) => {
        console.error('[OR-Tools] Failed to start Python process:', err);
        reject(new Error(`Failed to start solver: ${err.message}`));
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`[OR-Tools] Solver exited with code ${code}`);
          console.error(`[OR-Tools] STDERR:\n${stderr}`);
          reject(new Error(`Python solver failed (code ${code})`));
          return;
        }

        try {
          const parsed: VRPTWResult = JSON.parse(stdout);
          resolve(parsed);
        } catch (e) {
          console.error('[OR-Tools] Failed to parse solver output:', stdout);
          reject(new Error('Invalid JSON returned from solver'));
        }
      });
    });
  }
}
