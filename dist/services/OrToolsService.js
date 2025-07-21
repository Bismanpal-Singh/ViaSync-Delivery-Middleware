"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrToolsService = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
class OrToolsService {
    constructor() {
        this.solverPath = path_1.default.join(__dirname, '../../python/vrptw_solver.py');
    }
    async solveVRPTW(data) {
        return new Promise((resolve, reject) => {
            const pythonProcess = (0, child_process_1.spawn)('python3', [this.solverPath, JSON.stringify(data)]);
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
                    const parsed = JSON.parse(stdout);
                    resolve(parsed);
                }
                catch (e) {
                    console.error('[OR-Tools] Failed to parse solver output:', stdout);
                    reject(new Error('Invalid JSON returned from solver'));
                }
            });
        });
    }
}
exports.OrToolsService = OrToolsService;
//# sourceMappingURL=OrToolsService.js.map