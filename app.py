# app.py
from flask import Flask, send_from_directory, jsonify, request
from pathlib import Path

app = Flask(__name__, static_folder=".", static_url_path="")

# Serve a página
@app.get("/")
def index():
    return send_from_directory(".", "index.html")

# Endpoint para atualizar os sorteios
@app.post("/api/update")
def api_update():
    try:
        from update_data import update_draws
        ok, msg = update_draws()
        return jsonify({"ok": ok, "message": msg}), (200 if ok else 500)
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500

# (Opcional) servir qualquer arquivo estático
@app.get("/<path:path>")
def static_files(path):
    return send_from_directory(".", path)

if __name__ == "__main__":
    # roda em 0.0.0.0 para acessar de outra máquina se quiser
    app.run(host="127.0.0.1", port=5000, debug=True)
