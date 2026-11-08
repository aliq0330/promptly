(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,24019,t=>{"use strict";t.s(["developerEndpoints",0,function(t){let e=(t??"").trim().replace(/\/+$/,"");if(!/^https:\/\/[^/\s]+$/.test(e))return null;let r=`${e}/functions/v1/api/v1`;return{mcpUrl:`${e}/functions/v1/mcp`,mcpMeUrl:`${e}/functions/v1/mcp/me`,apiBase:r,openApiUrl:`${r}/openapi.json`}},"developerSnippets",0,function(t){let{mcpUrl:e,mcpMeUrl:r,apiBase:p}=t;return{claudeCode:`claude mcp add --transport http promptly ${e}`,cursorJson:JSON.stringify({mcpServers:{promptly:{url:e}}},null,2),vscodeJson:JSON.stringify({servers:{promptly:{type:"http",url:e}}},null,2),windsurfJson:JSON.stringify({mcpServers:{promptly:{serverUrl:e}}},null,2),geminiCli:`gemini mcp add --transport http --scope user promptly ${e}`,codexToml:`[mcp_servers.promptly]
url = "${e}"`,localNpx:"claude mcp add promptly -- npx -y promptly-mcp",claudeDesktopJson:JSON.stringify({mcpServers:{promptly:{command:"npx",args:["-y","promptly-mcp"]}}},null,2),curlSearch:`curl "${p}/prompts?q=cyberpunk&content_type=image&limit=5"`,curlGet:`curl "${p}/prompts/<id>"`,curlSearchContent:`curl "${p}/workflows?q=logo&limit=5"`,curlFill:`curl -X POST "${p}/prompts/<id>/fill" \\
  -H "Content-Type: application/json" \\
  -d '{"values":{"subject":"a lighthouse"}}'`,fetchJs:`const res = await fetch("${p}/prompts?q=logo&limit=3");
const { items } = await res.json();
console.log(items[0].title, items[0].url);`,curlMe:`curl "${p}/me" \\
  -H "Authorization: Bearer pmt_YOUR_KEY"`,curlMeList:`curl "${p}/me/prompts?status=draft&limit=10" \\
  -H "Authorization: Bearer pmt_YOUR_KEY"`,curlMeListOther:`curl "${p}/me/requests?status=draft&limit=10" \\
  -H "Authorization: Bearer pmt_YOUR_KEY"`,curlMeLibrary:`curl "${p}/me/libraries" \\
  -H "Authorization: Bearer pmt_YOUR_KEY"

# LIBRARY_ID = the "id" returned above
curl "${p}/me/libraries/LIBRARY_ID/prompts" \\
  -H "Authorization: Bearer pmt_YOUR_KEY"`,curlMeUpdate:`curl -X PATCH "${p}/me/requests/DRAFT_ID" \\
  -H "Authorization: Bearer pmt_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"expectedUpdatedAt":"2026-11-02T10:00:00.123Z","changes":{"title":"New title"}}'`,curlMeSave:`curl -X POST "${p}/me/prompts" \\
  -H "Authorization: Bearer pmt_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d @promptly-prompts.json`,claudeCodeMe:`claude mcp add --transport http promptly-me ${r} \\
  --header "Authorization: Bearer pmt_YOUR_KEY"`,cursorMeJson:JSON.stringify({mcpServers:{"promptly-me":{url:r,headers:{Authorization:"Bearer pmt_YOUR_KEY"}}}},null,2),pythonRequests:`import requests

res = requests.get("${p}/prompts", params={"q": "logo", "limit": 3})
for item in res.json()["items"]:
    print(item["title"], item["url"])`}},"teamMcpUrl",0,function(t,e){return`${t.mcpUrl}/team/${e}`}])}]);