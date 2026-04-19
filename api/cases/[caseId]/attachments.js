import { proxyRequest } from '../../_lib/proxy.js';

export default async function handler(req, res) {
  const { caseId } = req.query;
  return proxyRequest(req, res, `/cases/${caseId}/attachments`);
}
