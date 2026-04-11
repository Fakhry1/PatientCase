import { proxyRequest } from '../../_lib/proxy.js';

export default async function handler(req, res) {
  return proxyRequest(req, res, '/cases/webhook/case-created');
}
