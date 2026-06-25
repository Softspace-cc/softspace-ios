import { Router } from 'express';
import path from 'path';
import { existsSync, readdirSync } from 'fs';

const RELEASES_DIR = process.env.RELEASES_DIR || path.resolve('releases');

const router = Router();

function getWindowsReleaseDir() {
  return path.join(RELEASES_DIR, 'windows');
}

function getWindowsBetaReleaseDir() {
  return path.join(getWindowsReleaseDir(), 'beta');
}

function findLatestReleaseFile(dir = getWindowsReleaseDir(), pattern = /^SoftSpace-\d+\.\d+\.\d+\.zip$/i) {
  if (!existsSync(dir)) return null;

  const files = readdirSync(dir)
    .filter((name) => pattern.test(name))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  return files[0] || null;
}

router.get('/windows/latest.json', (_req, res, next) => {
  try {
    const fileName = findLatestReleaseFile();
    if (!fileName) {
      return res.status(404).json({ error: 'not_found' });
    }

    res.json({
      fileName,
      downloadPath: `/api/releases/windows/${fileName}`,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/windows/beta/latest.json', (_req, res, next) => {
  try {
    const fileName = findLatestReleaseFile(
      getWindowsBetaReleaseDir(),
      /^SoftSpace-Beta-\d+\.\d+\.\d+\.zip$/i
    );
    if (!fileName) {
      return res.status(404).json({ error: 'not_found' });
    }

    res.json({
      fileName,
      downloadPath: `/api/releases/windows/beta/${fileName}`,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/windows/beta/:file', (req, res, next) => {
  try {
    const fileName = path.basename(req.params.file);
    if (!/^SoftSpace-Beta-\d+\.\d+\.\d+\.zip$/i.test(fileName)) {
      return res.status(404).json({ error: 'not_found' });
    }

    const filePath = path.join(getWindowsBetaReleaseDir(), fileName);
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'not_found' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.download(filePath, fileName);
  } catch (err) {
    next(err);
  }
});

router.get('/windows/:file', (req, res, next) => {
  try {
    const fileName = path.basename(req.params.file);
    if (!/^SoftSpace-\d+\.\d+\.\d+\.zip$/i.test(fileName)) {
      return res.status(404).json({ error: 'not_found' });
    }

    const filePath = path.join(getWindowsReleaseDir(), fileName);
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'not_found' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.download(filePath, fileName);
  } catch (err) {
    next(err);
  }
});

export { RELEASES_DIR };
export default router;
