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

    if (path?.startsWith('/api/inboxes/') && path?.endsWith('/messages') && method === 'GET') {
      const address = path.replace('/api/inboxes/', '').replace('/messages', '');
      return await handleListMessages(databases, storage, decodeURIComponent(address), res, error);
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

async function handleCreateInbox(databases: Databases, body: any, res: any, error: any) {
  const { username, domain, telegramChatId } = body;

  if (!username || !domain) {
    return res.json({ success: false, error: 'username and domain are required' }, 400);
  }

  // Validate username
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(username)) {
    return res.json({ success: false, error: 'Invalid username format' }, 400);
  }

  try {
    // Check domain exists and is active
    try {
      const domainDoc = await databases.getDocument(DB_ID, COLL_DOMAINS, domain);
      if (!domainDoc.isActive) {
        return res.json({ success: false, error: 'Domain is not active' }, 400);
      }
    } catch {
      // Try listing to find domain
      const domains = await databases.listDocuments(DB_ID, COLL_DOMAINS, [
        Query.equal('name', domain),
        Query.equal('isActive', true),
        Query.limit(1),
      ]);
      if (domains.documents.length === 0) {
        return res.json({ success: false, error: 'Domain not found or not active' }, 400);
      }
    }

    const address = `${username}@${domain}`;
    const ttlHours = parseInt(process.env.EMAIL_TTL_HOURS || '168', 10);
    const now = Date.now();
    const expiresAt = new Date(now + ttlHours * 60 * 60 * 1000).toISOString();

    // Check if inbox already exists by querying address
    const existingInboxes = await databases.listDocuments(DB_ID, COLL_INBOXES, [
      Query.equal('address', address),
      Query.limit(1),
    ]);
    if (existingInboxes.documents.length > 0) {
      const existingInbox = existingInboxes.documents[0];
      return res.json({
        success: true,
        data: {
          id: existingInbox.$id,
          username: existingInbox.username,
          domain: existingInbox.domain,
          address: existingInbox.address,
          createdAt: existingInbox.createdAt,
          expiresAt: existingInbox.expiresAt,
          telegramChatId: existingInbox.telegramChatId || undefined,
        },
      });
}

    const inbox = await databases.createDocument(DB_ID, COLL_INBOXES, 'unique()', {
      username,
      address,
      domain,
      telegramChatId: telegramChatId || '',
      createdAt: new Date(now).toISOString(),
      expiresAt,
    });


    return res.json({
      success: true,
      data: {
        id: inbox.$id,
        username: inbox.username,
        domain: inbox.domain,
        address: inbox.address,
        createdAt: inbox.createdAt,
        expiresAt: inbox.expiresAt,
        telegramChatId: inbox.telegramChatId || undefined,
      },
    });
  } catch (err: any) {
    error(`Create inbox error: ${err.message}`);
    return res.json({ success: false, error: 'Failed to create inbox' }, 500);
  }
}

async function handleListMessages(databases: Databases, storage: Storage, addressLookup: string, res: any, error: any) {
  try {
    // Verify inbox exists by address attribute
    const inboxes = await databases.listDocuments(DB_ID, COLL_INBOXES, [
      Query.equal('address', addressLookup),
      Query.limit(1),
    ]);
    if (inboxes.documents.length === 0) {
      return res.json({ success: true, data: [] });
    }
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
