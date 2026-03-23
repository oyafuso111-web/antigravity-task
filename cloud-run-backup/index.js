const { Storage } = require('@google-cloud/storage');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET_NAME = process.env.BUCKET_NAME;

const storage = new Storage();
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// メインハンドラー：リクエスト内容でバックアップ/復元/リスト表示を分岐
exports.handleDataOperation = async (req, res) => {
  // Add CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '3600');
    return res.status(204).send('');
  }

  const { action, fileName } = req.body || {};

  try {
    if (action === 'backup') {
      return await backupToGCS(res);
    } else if (action === 'restore') {
      return await restoreFromGCS(fileName, res);
    } else if (action === 'list') {
      return await listBackups(res);
    } else {
      res.status(400).send({ error: 'Invalid action. Use "backup", "restore", or "list".' });
    }
  } catch (error) {
    console.error('Operation failed:', error);
    res.status(500).send({ error: error.message });
  }
};

async function listBackups(res) {
  const [files] = await storage.bucket(BUCKET_NAME).getFiles({ prefix: 'backup-' });
  const fileNames = files.map(f => f.name).sort((a, b) => b.localeCompare(a));
  res.status(200).send({ files: fileNames });
}

async function backupToGCS(res) {
  const [tasks, projects, tags] = await Promise.all([
    supabase.from('tasks').select('*'),
    supabase.from('projects').select('*'),
    supabase.from('tags').select('*')
  ]);

  const backupData = {
    timestamp: new Date().toISOString(),
    tasks: tasks.data || [], projects: projects.data || [], tags: tags.data || []
  };

  const fileName = `backup-${new Date().toISOString().split('T')[0]}.json`;
  await storage.bucket(BUCKET_NAME).file(fileName).save(JSON.stringify(backupData, null, 2));
  res.status(200).send({ message: 'Backup successful', fileName });
}

async function restoreFromGCS(fileName, res) {
  if (!fileName) throw new Error('fileName is required for restore.');
  const [content] = await storage.bucket(BUCKET_NAME).file(fileName).download();
  const data = JSON.parse(content.toString());

  // upsertで復元 (tags -> projects -> tasks の順で整合性を維持)
  if (data.tags && data.tags.length > 0) await supabase.from('tags').upsert(data.tags);
  if (data.projects && data.projects.length > 0) await supabase.from('projects').upsert(data.projects);
  if (data.tasks && data.tasks.length > 0) await supabase.from('tasks').upsert(data.tasks);

  res.status(200).send({ message: 'Restore successful', restoredFrom: fileName });
}
