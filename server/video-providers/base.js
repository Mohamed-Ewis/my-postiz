/**
 * AI video provider contract.
 * @typedef {Object} VideoProvider
 * @property {string} id
 * @property {string} name
 * @property {string[]} envVars
 * @property {() => boolean} isConfigured
 * @property {(input:{prompt:string, imagePath?:string, imageMime?:string, aspect:string, duration:number}) => Promise<{externalId:string, data:Object}>} submit
 * @property {(job:{externalId:string, data:Object}) => Promise<{state:'PENDING'|'DONE'|'ERROR', progress?:number, videoUrl?:string, error?:string}>} status
 */
export function defineVideoProvider (p) {
  return { envVars: [], isConfigured () { return this.envVars.every(k => !!process.env[k]) }, ...p }
}
