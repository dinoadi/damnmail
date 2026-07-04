export default async ({ req, res, log, error }: any) => {
  log('Cleanup disabled — keeping all email history visible');
  return res.json({ success: true, data: { disabled: true } });
};
