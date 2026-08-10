import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const MODEL_URL =
	'https://huggingface.co/mayocream/comic-text-detector-onnx/resolve/main/comic-text-detector.onnx?download=true';
const EXPECTED_SHA256 = '1a86ace74961413cbd650002e7bb4dcec4980ffa21b2f19b86933372071d718f';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modelDirectory = resolve(repositoryRoot, 'front', 'static', 'models');
const modelPath = resolve(modelDirectory, 'comic-text-detector.onnx');
const temporaryPath = `${modelPath}.download`;

async function sha256(path) {
	const hash = createHash('sha256');
	await pipeline(createReadStream(path), hash);
	return hash.digest('hex');
}

async function hasValidLocalModel() {
	try {
		return (await sha256(modelPath)) === EXPECTED_SHA256;
	} catch (error) {
		if (error?.code === 'ENOENT') return false;
		throw error;
	}
}

async function downloadModel() {
	if (await hasValidLocalModel()) {
		console.log(`Model is ready: ${modelPath}`);
		return;
	}

	await mkdir(modelDirectory, { recursive: true });
	await rm(temporaryPath, { force: true });

	console.log('Downloading comic text detector model...');
	const response = await fetch(MODEL_URL, { redirect: 'follow' });
	if (!response.ok || !response.body) {
		throw new Error(`Model download failed: HTTP ${response.status}`);
	}

	try {
		await pipeline(Readable.fromWeb(response.body), createWriteStream(temporaryPath));
		const downloadedHash = await sha256(temporaryPath);
		if (downloadedHash !== EXPECTED_SHA256) {
			throw new Error(
				`Model checksum mismatch: expected ${EXPECTED_SHA256}, received ${downloadedHash}`,
			);
		}

		await rm(modelPath, { force: true });
		await rename(temporaryPath, modelPath);
		console.log(`Model downloaded and verified: ${modelPath}`);
	} catch (error) {
		await rm(temporaryPath, { force: true });
		throw error;
	}
}

downloadModel().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});

