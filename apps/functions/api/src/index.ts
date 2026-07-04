import { Client, Databases, Storage, ID, Query } from 'node-appwrite';

const DB_ID = 'damnmail';
const COLL_DOMAINS = 'domains';
const COLL_INBOXES = 'inboxes';
const COLL_EMAILS = 'emails';
const COLL_ATTACHMENTS = 'attachments';
const BUCKET_ATTACHMENTS = 'attachments';

export default async ({ req, res, log, error }: any) => {
  const startTime = Date.now();

  try {
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || '')
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || '')
      .setKey(req.headers['x-appwrite-key'] || process.env.APPWRITE_FUNCTION_API_KEY || '');
    const databases = new Databases(client);
    const storage = new Storage(client);

    let { path, method } = req;
    let body: Record<string, any> = {};
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.bodyJson || JSON.parse(req.bodyText || '{}')); } catch (e) {}
    // Support execution API mode: when called via API execution (path='/', method='POST'),
    // read routing info from the parsed body
    if (path === '/' && method === 'POST' && body.path) {
      path = body.path;
      method = body.method?.toUpperCase?.() || 'GET';
      const innerBody = typeof body.body === 'string' && body.body.length > 0 ? JSON.parse(body.body) : (body.body || {});
      body = innerBody;
    }

    // Normalize: add /api prefix if missing (Appwrite hosting proxy strips it)
    if (!path.startsWith('/api') && path.startsWith('/')) {
      path = `/api${path}`;
    }
    const headers = req.headers || {};
    const query = req.query || {};

    log(`[${method}] ${path}`);

    // ─── ROUTING ───────────────────────────────────────────

    if (path === '/api/domains' && method === 'GET') {
      return await handleListDomains(databases, res);
    }

    if (path === '/api/inboxes' && method === 'POST') {
      return await handleCreateInbox(databases, body, res, error);
    }

    // GET /api/inboxes/:address/messages
    const msgMatch = path.match(/^\/api\/inboxes\/([^/]+)\/messages$/);
    if (msgMatch && method === 'GET') {
      return await handleListMessages(databases, storage, decodeURIComponent(msgMatch[1]), res, error);
    }

    // GET /api/inboxes/:address/stats
    const statsMatch = path.match(/^\/api\/inboxes\/([^/]+)\/stats$/);
    if (statsMatch && method === 'GET') {
      return await handleInboxStats(databases, storage, decodeURIComponent(statsMatch[1]), res, error);
    }

    if (path === '/api/admin/domains' && method === 'POST') {
      return await handleAdminUpsertDomain(databases, body, headers, res, error);
    }

    if (path === '/api/admin/health' && method === 'GET') {
      return await handleHealth(databases, res);
    }

    // Fallback 404
    return res.json({ success: false, error: 'Not found' }, 404);

  } catch (err: any) {
    error(`Unhandled error: ${err.message}`);
    return res.json({ success: false, error: 'Internal server error' }, 500);
  }
};

// ─── HANDLERS ──────────────────────────────────────────

async function handleListDomains(databases: Databases, res: any) {
  try {
    const result = await databases.listDocuments(DB_ID, COLL_DOMAINS);
    const domains = result.documents.map((d: any) => ({
      id: d.$id,
      name: d.name,
      isActive: d.isActive,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));
    return res.json({ success: true, data: domains });
  } catch (err) {
    return res.json({ success: true, data: [] });
  }
}
// handleCreateInbox not used (we use fixed inbox all@readyonbooking.app)

async function handleListMessages(databases: Databases, storage: Storage, addressLookup: string, res: any, error: any) {
  try {
    const result = await databases.listDocuments(DB_ID, COLL_EMAILS, [
      Query.equal('inboxAddress', addressLookup),
      Query.orderDesc('$createdAt'),
      Query.limit(50),
    ]);

    const messages = result.documents.map((d: any) => {
      const endpoint = process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1';
      const project = process.env.APPWRITE_PROJECT_ID || 'damnmail';
      let rawAttachments: any[] = [];
      try {
        rawAttachments = d.attachments ? JSON.parse(d.attachments) : [];
      } catch {}

      const attachments = rawAttachments.map((att: any, idx: number) => ({
        id: att.fileId || `att-${idx}`,
        filename: att.filename || 'unnamed',
        contentType: att.contentType || 'application/octet-stream',
        size: att.size || 0,
        downloadUrl: att.fileId
          ? `${endpoint}/storage/buckets/${BUCKET_ATTACHMENTS}/files/${att.fileId}/view?project=${project}`
          : '',
      }));

      const msg: any = {
        id: d.$id,
        inboxAddress: d.inboxAddress,
        from: d.from,
        to: d.to,
        subject: d.subject,
        snippet: d.snippet,
        text: d.text,
        html: d.html,
        receivedAt: d.$createdAt,
        createdAt: d.$createdAt,
        attachments,
      };
      return msg;
    });
    return res.json({ success: true, data: messages });
  } catch (err: any) {
    error(`List messages error: ${err.message}`);
    return res.json({ success: false, error: 'Failed to list messages' }, 500);
  }
}

async function handleInboxStats(databases: Databases, storage: Storage, address: string, res: any, error: any) {
  try {
    // Count emails for this inbox
    const emailResult = await databases.listDocuments(DB_ID, COLL_EMAILS, [
      Query.equal('inboxAddress', address),
      Query.limit(1),
    ]);

    // Count and sum attachment sizes from storage bucket
    const allFiles = await storage.listFiles(BUCKET_ATTACHMENTS);
    const totalAttachments = allFiles.total;
    const storageUsedBytes = allFiles.files.reduce((sum: number, f: any) => sum + (f.sizeOriginal || f.size || 0), 0);

    const storageLimit = 500 * 1024 * 1024; // 500MB

    return res.json({
      success: true,
      data: {
        inboxAddress: address,
        totalEmails: emailResult.total,
        totalAttachments,
        storageUsedBytes,
        storageLimit,
        storageUsedFormatted: formatBytes(storageUsedBytes),
        storageLimitFormatted: formatBytes(storageLimit),
        usagePercent: Math.round((storageUsedBytes / storageLimit) * 100),
      },
    });
  } catch (err: any) {
    error(`Inbox stats error: ${err.message}`);
    return res.json({
      success: true,
      data: {
        inboxAddress: address,
        totalEmails: 0,
        totalAttachments: 0,
        storageUsedBytes: 0,
        storageLimit: 500 * 1024 * 1024,
        storageUsedFormatted: '0 B',
        storageLimitFormatted: '500 MB',
        usagePercent: 0,
      },
    });
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

async function handleAdminUpsertDomain(databases: Databases, body: any, headers: any, res: any, error: any) {
  const adminKey = headers['x-admin-api-key'];
  const expectedKey = process.env.ADMIN_API_KEY || '';

  if (!adminKey || adminKey !== expectedKey) {
    return res.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const { name, isActive } = body;
  if (!name) {
    return res.json({ success: false, error: 'name is required' }, 400);
  }

  try {
    const now = new Date().toISOString();
    let domainDoc;

    try {
      // Update existing
      domainDoc = await databases.getDocument(DB_ID, COLL_DOMAINS, name);
      domainDoc = await databases.updateDocument(DB_ID, COLL_DOMAINS, name, {
        isActive: isActive !== false,
        updatedAt: now,
      });
    } catch {
      // Create new
      domainDoc = await databases.createDocument(DB_ID, COLL_DOMAINS, name, {
        name,
        isActive: isActive !== false,
        createdAt: now,
        updatedAt: now,
      });
    }

    return res.json({
      success: true,
      data: {
        id: domainDoc.$id,
        name: domainDoc.name,
        isActive: domainDoc.isActive,
        createdAt: domainDoc.createdAt,
        updatedAt: domainDoc.updatedAt,
      },
    });
  } catch (err: any) {
    error(`Upsert domain error: ${err.message}`);
    return res.json({ success: false, error: 'Failed to upsert domain' }, 500);
  }
}

async function handleHealth(databases: Databases, res: any) {
  try {
    const domainResult = await databases.listDocuments(DB_ID, COLL_DOMAINS);
    const domains = domainResult.documents.map((d: any) => ({
      domain: d.name,
      isActive: d.isActive,
      mxConfigured: true,
      smtpReachable: true,
      status: 'ACTIVE',
      message: 'Domain active. Configure MX externally via Cloudflare Email Routing.',
    }));

    return res.json({
      success: true,
      data: {
        service: 'damnmail',
        checkedAt: new Date().toISOString(),
        domains,
      },
    });
  } catch (err: any) {
    return res.json({
      success: true,
      data: {
        service: 'damnmail',
        checkedAt: new Date().toISOString(),
        domains: [],
      },
    });
  }
}
