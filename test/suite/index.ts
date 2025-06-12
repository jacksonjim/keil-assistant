import * as path from 'path';
import { glob} from 'glob'

export function run(): Promise<void> {
	// Create the mocha test

	const testsRoot = path.resolve(__dirname, '..');

	return new Promise((_c, _e) => {
		glob('**/**.test.js', { cwd: testsRoot });
		
	});
}