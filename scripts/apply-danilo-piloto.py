"""Registra o piloto (bruto "1" do Eu.daviqueiroz, editado em 14/10) como a
primeira edição do Danilo, pronta pro Davi revisar no mini editor."""
import json, shutil
from pathlib import Path
from migration_db import connect

CLIENTE = "e4b24f93-0eda-43fc-b50e-3ebe24f8905f"
DRIVE = Path.home() / "Library/CloudStorage/GoogleDrive-metafocando@gmail.com/Meu Drive/Projeto 100k/Eu.davi"
c = connect(); q = c.cursor()
q.execute("SELECT id FROM public.edicoes_video WHERE cliente_id = %s AND titulo = %s", (CLIENTE, "Piloto — 3 habilidades (bruto 1)"))
if q.fetchone():
    raise SystemExit("já registrado")
q.execute("""INSERT INTO public.edicoes_video (cliente_id, titulo, status, bruto_drive, duracao)
             VALUES (%s, %s, 'revisar', %s, 107.1) RETURNING id""",
          (CLIENTE, "Piloto — 3 habilidades (bruto 1)", str(DRIVE / "Precisa de edição" / "[EDITADO] 1")))
id_ = str(q.fetchone()[0])
origem = Path.home() / ".infopro-hub/danilo/piloto-2"
destino = Path.home() / ".infopro-hub/danilo/edicoes" / id_
destino.parent.mkdir(parents=True, exist_ok=True)
shutil.move(str(origem), destino)
# Caminhos do projeto passam a apontar pra pasta nova.
p = json.loads((destino / "projeto.json").read_text())
txt = json.dumps(p, ensure_ascii=False).replace(str(origem), str(destino))
(destino / "projeto.json").write_text(json.dumps(json.loads(txt), ensure_ascii=False, indent=1))
# Piloto: entrega numa subpasta de teste, não mexe no bruto (já está [EDITADO]).
(destino / "entrega.json").write_text(json.dumps({"destino_dir": str(DRIVE / "Editado"), "nome_final": "1-editado-danilo-piloto"}))
c.commit()
print("edição", id_)
