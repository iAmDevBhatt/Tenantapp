import { AxiosInstance } from 'axios'

/** Fetches a binary endpoint (PDF, QR PNG, uploaded document) through an
 * authed axios client and returns a blob object URL. Needed because a plain
 * `<img src>`/`<a href>` to an authed API route can't carry an Authorization
 * header -- the browser would request it anonymously and get a 401. Caller
 * is responsible for URL.revokeObjectURL() when done (e.g. on unmount). */
export async function fetchAuthedBlob(client: AxiosInstance, url: string): Promise<string> {
  const res = await client.get(url, { responseType: 'blob' })
  return URL.createObjectURL(res.data as Blob)
}

export function triggerBlobDownload(blobUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
