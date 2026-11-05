import {getStore} from '@netlify/blobs';
import {createNetlifyHandler} from '../../netlify-adapter.mjs';
export default createNetlifyHandler({getStore,tmdb:process.env.TMDB_API_KEY||''});
export const config={path:'/*',preferStatic:true};
