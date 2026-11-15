"""Reinscreve o webhook de cada conta do Instagram conectada com os campos atuais (inclui `messaging_seen`, o "visto" que alimenta a taxa de abertura do Many Hub).
Uso: python3 scripts/instagram-reinscrever-webhook.py  (não imprime tokens)"""
import json, ssl, sys, urllib.request, urllib.parse
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from migration_db import connect
import certifi
CAMPOS = "comments,messages,messaging_seen"
ctx = ssl.create_default_context(cafile=certifi.where())
c = connect(); q = c.cursor()
q.execute("SELECT ig_user_id, username, access_token FROM public.instagram_conexoes")
for ig, user, tok in q.fetchall():
    req = urllib.request.Request(f"https://graph.instagram.com/v23.0/me/subscribed_apps?subscribed_fields={urllib.parse.quote(CAMPOS)}", method="POST", headers={"Authorization": f"Bearer {tok}"})
    try:
        r = urllib.request.urlopen(req, context=ctx, timeout=30); print(user or ig, r.status, r.read()[:80])
    except urllib.error.HTTPError as e:
        print(user or ig, e.code, e.read()[:160])
