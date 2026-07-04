import { Client, Databases, Query } from 'node-appwrite';

const DB_ID = 'damnmail';
const COLL_INBOXES = 'inboxes';
const COLL_EMAILS = 'emails';

export default async ({ req, res, log, error }: any) => {
  try {
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || '')
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || '')
      .setKey(req.headers['x-appwrite-key'] || '');
    const databases = new Databases(client);

    const now = new Date().toISOString();
    let deletedInboxes = 0;
    let deletedEmails = 0;

    try {
      // Find all expired inboxes
      const expiredInboxes = await databases.listDocuments(DB_ID, COLL_INBOXES, [
        Query.lessThan('expiresAt', now),
        Query.limit(100),
      ]);

      log(`Found ${expiredInboxes.documents.length} expired inboxes`);

      // Delete emails for each expired inbox, then delete the inbox
      for (const inbox of expiredInboxes.documents) {
        try {
          // Delete all emails for this inbox
          const emails = await databases.listDocuments(DB_ID, COLL_EMAILS, [
            Query.equal('inboxAddress', inbox.address),
            Query.limit(100),
          ]);

          for (const email of emails.documents) {
            try {
              await databases.deleteDocument(DB_ID, COLL_EMAILS, email.$id);
              deletedEmails++;
            } catch (err: any) {
              error(`Failed to delete email ${email.$id}: ${err.message}`);
            }
          }

          // Delete the inbox
          await databases.deleteDocument(DB_ID, COLL_INBOXES, inbox.$id);
          deletedInboxes++;
          log(`Deleted expired inbox: ${inbox.$id}`);
        } catch (err: any) {
          error(`Failed to delete inbox ${inbox.$id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      // Collection may not exist yet
      log(`Cleanup collections not found: ${err.message}`);
    }

    log(`Cleanup complete: ${deletedInboxes} inboxes, ${deletedEmails} emails deleted`);

    return res.json({
      success: true,
      data: {
        deletedInboxes,
        deletedEmails,
        timestamp: now,
      },
    });
  } catch (err: any) {
    error(`Cleanup error: ${err.message}`);
    return res.json({ success: false, error: err.message }, 500);
  }
};
