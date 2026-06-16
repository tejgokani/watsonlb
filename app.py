import asyncio, httpx, os, json, time
from pathlib import Path
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

app = FastAPI(title="OSMIUM")

templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="static")

MASTER_HOST = os.getenv("MASTER_HOST", "localhost")
MASTER_PORT = os.getenv("MASTER_PORT", "8089")
LOCUST_BASE = f"http://{MASTER_HOST}:{MASTER_PORT}"

connected_websockets = set()


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/stats")
async def get_stats():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{LOCUST_BASE}/stats/requests")
            stats = r.json()
            return {"stats": stats}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=503)


@app.post("/api/test/start")
async def start_test(data: dict):
    host = data.get("host", "https://example.com")
    users = data.get("users", 10)
    spawn_rate = data.get("spawn_rate", 2)
    duration = data.get("duration", 60)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(f"{LOCUST_BASE}/swarm", params={
                "user_count": users, "spawn_rate": spawn_rate, "host": host
            })
        if duration > 0:
            asyncio.create_task(stop_after(duration))
        return {"status": "started", "users": users, "duration": duration}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=503)


@app.post("/api/test/stop")
async def stop_test():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.get(f"{LOCUST_BASE}/stop")
        return {"status": "stopped"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=503)


@app.get("/api/report")
async def generate_report():
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{LOCUST_BASE}/stats/requests")
            stats = r.json()

        report = {
            "generated_at": time.time(),
            "summary": {
                "total_requests": stats.get("total_rps", 0),
                "fail_ratio": stats.get("fail_ratio", 0),
                "avg_response_time": stats.get("avg_response_time", 0),
            },
            "stats": stats,
        }

        reports_dir = Path("reports")
        reports_dir.mkdir(exist_ok=True)
        report_path = reports_dir / f"report_{int(time.time())}.json"
        report_path.write_text(json.dumps(report, indent=2))

        for ws in connected_websockets.copy():
            try:
                await ws.send_json(report)
            except Exception:
                connected_websockets.discard(ws)

        return report
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=503)


async def stop_after(seconds: int):
    await asyncio.sleep(seconds)
    async with httpx.AsyncClient(timeout=5) as client:
        await client.get(f"{LOCUST_BASE}/stop")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_websockets.add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connected_websockets.discard(websocket)
