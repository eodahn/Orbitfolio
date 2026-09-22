import http from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./server/db.js";
import { seedDevelopmentData } from "./server/seed.js";
import { ApiError, clearSession, createProject, createSession, login, publicProject, publicUser, rankingProjects, register, requireUser, sessionCookie, sessionUser, setRelation } from "./server/app.js";

const root=fileURLToPath(new URL(".",import.meta.url)); const db=openDatabase(); if(process.env.SEED_DEMO !== "false") seedDevelopmentData(db);
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".png":"image/png"};
const reply=(res,status,payload,headers={})=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",...headers});res.end(status===204?undefined:JSON.stringify(payload));};
async function readJson(req){let raw="";for await(const chunk of req){raw+=chunk;if(raw.length>1_000_000)throw new ApiError(413,"Requisição muito grande.");}try{return raw?JSON.parse(raw):{};}catch{throw new ApiError(400,"JSON inválido.");}}
const methodIsMutation=(method)=>["POST","PUT","PATCH","DELETE"].includes(method);
function csrf(req){
  if(!methodIsMutation(req.method))return;
  const origin=req.headers.origin;
  // Vite proxies same-site browser requests during development. Keep the
  // production origin check while allowing only the documented local dev hosts.
  const allowed=new Set([`http://${req.headers.host}`,"http://localhost:5173","http://127.0.0.1:5173"]);
  if(origin && !allowed.has(origin))throw new ApiError(403,"Origem inválida.");
}

const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host}`);const path=url.pathname;csrf(req);const user=sessionUser(db,req.headers.cookie);
  if(path==="/api/health"&&req.method==="GET")return reply(res,200,{ok:true});
  if(path==="/api/auth/session"&&req.method==="GET")return reply(res,200,{user:publicUser(db,user,user?.id)});
  if(path==="/api/auth/register"&&req.method==="POST"){const account=register(db,await readJson(req));const session=createSession(db,account.id);return reply(res,201,{user:publicUser(db,account,account.id)},{"Set-Cookie":sessionCookie(session.token,session.expiresAt)});}
  if(path==="/api/auth/login"&&req.method==="POST"){const account=login(db,await readJson(req));const session=createSession(db,account.id);return reply(res,200,{user:publicUser(db,account,account.id)},{"Set-Cookie":sessionCookie(session.token,session.expiresAt)});}
  if(path==="/api/auth/logout"&&req.method==="POST")return reply(res,204,null,{"Set-Cookie":clearSession(db,req.headers.cookie)});
  if(path==="/api/projects"&&req.method==="GET"){const query=(url.searchParams.get("q")??"").trim();const rows=query?db.prepare("SELECT * FROM projects WHERE name LIKE ? OR description LIKE ? ORDER BY updated_at DESC").all(`%${query}%`,`%${query}%`):db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all();return reply(res,200,{projects:rows.map(row=>publicProject(db,row,user?.id))});}
  if(path==="/api/projects"&&req.method==="POST"){const project=createProject(db,requireUser(user),await readJson(req));return reply(res,201,{project:publicProject(db,project,user.id)});}
  const detail=path.match(/^\/api\/projects\/([^/]+)$/);if(detail&&req.method==="GET"){const project=db.prepare("SELECT * FROM projects WHERE id = ?").get(decodeURIComponent(detail[1]));if(!project)throw new ApiError(404,"Projeto não encontrado.");return reply(res,200,{project:publicProject(db,project,user?.id)});}
  const projectAction=path.match(/^\/api\/projects\/([^/]+)\/(like|favorite|commits)$/);if(projectAction){const project=db.prepare("SELECT * FROM projects WHERE id = ?").get(decodeURIComponent(projectAction[1]));if(!project)throw new ApiError(404,"Projeto não encontrado.");const action=projectAction[2];if(action==="commits"&&req.method==="GET")return reply(res,200,{commits:db.prepare("SELECT id, message, author_name AS author, committed_at AS committedAt FROM commits WHERE project_id = ? ORDER BY committed_at DESC").all(project.id)});const account=requireUser(user);if(!["POST","DELETE"].includes(req.method))throw new ApiError(405,"Método não permitido.");setRelation(db,action==="like"?"project_likes":"favorites",["user_id","project_id"],[account.id,project.id],req.method==="POST");return reply(res,200,{project:publicProject(db,project,account.id)});}
  if(path==="/api/favorites"&&req.method==="GET"){if(!user)return reply(res,200,{projects:[]});const rows=db.prepare("SELECT projects.* FROM favorites JOIN projects ON projects.id = favorites.project_id WHERE favorites.user_id = ? ORDER BY favorites.created_at DESC").all(user.id);return reply(res,200,{projects:rows.map(row=>publicProject(db,row,user.id))});}
  if(path==="/api/progress"&&req.method==="GET"){const account=requireUser(user);const rows=db.prepare("SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC").all(account.id);return reply(res,200,{projects:rows.map(row=>publicProject(db,row,account.id)),favorites:db.prepare("SELECT COUNT(*) AS count FROM favorites WHERE user_id = ?").get(account.id).count,following:db.prepare("SELECT COUNT(*) AS count FROM follows WHERE follower_id = ?").get(account.id).count});}
  if(path==="/api/rankings/featured"&&req.method==="GET"){const period=url.searchParams.get("period")??"week";if(!["week","month","all"].includes(period))throw new ApiError(422,"Período inválido.");return reply(res,200,{projects:rankingProjects(db,user?.id,period)});}
  if(path==="/api/users"&&req.method==="GET"){const query=(url.searchParams.get("q")??"").trim();const rows=query?db.prepare("SELECT * FROM users WHERE name LIKE ? OR bio LIKE ? ORDER BY name").all(`%${query}%`,`%${query}%`):db.prepare("SELECT * FROM users ORDER BY name").all();return reply(res,200,{users:rows.map(row=>publicUser(db,row,user?.id))});}
  const userDetail=path.match(/^\/api\/users\/([^/]+)$/);if(userDetail&&req.method==="GET"){const found=db.prepare("SELECT * FROM users WHERE id = ?").get(decodeURIComponent(userDetail[1]));if(!found)throw new ApiError(404,"Usuário não encontrado.");return reply(res,200,{user:publicUser(db,found,user?.id)});}
  const follow=path.match(/^\/api\/users\/([^/]+)\/follow$/);if(follow){const account=requireUser(user),target=decodeURIComponent(follow[1]);if(account.id===target)throw new ApiError(422,"Você não pode seguir a própria conta.");if(!db.prepare("SELECT 1 FROM users WHERE id = ?").get(target))throw new ApiError(404,"Usuário não encontrado.");if(!["POST","DELETE"].includes(req.method))throw new ApiError(405,"Método não permitido.");setRelation(db,"follows",["follower_id","followed_id"],[account.id,target],req.method==="POST");return reply(res,200,{following:req.method==="POST"});}
  if(path.startsWith("/api/"))throw new ApiError(404,"Endpoint não encontrado.");
  const dist=join(root,"dist"), requested=normalize(join(dist,path==="/"?"index.html":path));const file=requested.startsWith(dist)&&existsSync(requested)&&statSync(requested).isFile()?requested:join(dist,"index.html");if(!existsSync(file)){res.writeHead(503,{"Content-Type":"text/plain; charset=utf-8"});return res.end("Execute npm run build antes de iniciar o servidor.");}res.writeHead(200,{"Content-Type":types[extname(file)]??"application/octet-stream"});res.end(readFileSync(file));
}catch(error){reply(res,error instanceof ApiError?error.status:500,{error:error.message??"Falha interna."});}});
server.listen(Number(process.env.PORT??3000),()=>console.log(`Orbitfolio disponível em http://localhost:${process.env.PORT??3000}`));
