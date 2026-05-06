import os
import urllib.request

out_dir = r"c:\Users\alans\Documents\Repocitorio_recetas\RecipePantry\stitch_downloads\notas"
os.makedirs(out_dir, exist_ok=True)

files = [
    ("mis_notas_culinas.html", "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzlhNTVjOWFmNDA2ZDQzMGM5MzA4ZDk3ZTZiZTFlNDE4EgsSBxDDndnpnB0YAZIBJAoKcHJvamVjdF9pZBIWQhQxNTgzNjAyNjE2ODI1MDY2MjUzOA&filename=&opi=89354086"),
    ("mis_notas_culinas.png", "https://lh3.googleusercontent.com/aida/ADBb0uiAgqX7pdq_h77w6RIziO3Sdy4rnwIxOeHJVDNmLW7lNl69JB80eHT5EP5rke6Ueh4eiFyZ326oATOjLuUirLIS0Wgog0sTkWInSlEX11-lMygf4mOrVdVFhAp6Kc0XIN8hL8WZlhivzqHAnBFcYuB36sj_1i-Jva3Ql2Cm3I9ZIQXntvzWRz9vL0_0MSzbGdqnLTb0zfNru44FPIqOR95pUfU2yBznIu9NNW_EOyCDoOTQcWB90xyolVDL"),
    ("notas_vacias.html", "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzEzYjc1Y2E0MWI2NjRkZjNhNjI5MTk0ODBlMzg4MWNjEgsSBxDDndnpnB0YAZIBJAoKcHJvamVjdF9pZBIWQhQxNTgzNjAyNjE2ODI1MDY2MjUzOA&filename=&opi=89354086"),
    ("notas_vacias.png", "https://lh3.googleusercontent.com/aida/ADBb0uhd8_F4lU-ypBY-QO3ruKR1Eb-eFlSlDbXEfZYBmcIuBUHddxdb3JQyK04V4EGBlcARNGEKXNza3VWFi7T2RVzUIhawOvZQtVgmXTsSqe4iphyOIYbnDdUt7CK0cHgUycpjWQtTSUSm-WXBzotRZjOU2kK3RiGuibSp4VSXR-Rc_WXaIF5rsFGSKmuxRKgFu2NHKnsPIJEDy9CPfxwICRoFzchhFJbnzFFC7SZogszOq4mxg2vYiv9pq7Q"),
    ("editando_nota.html", "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2EzZGQyOGY1MGU0ZDRiNTRiYTYxNDcyMjE3OGFjODkxEgsSBxDDndnpnB0YAZIBJAoKcHJvamVjdF9pZBIWQhQxNTgzNjAyNjE2ODI1MDY2MjUzOA&filename=&opi=89354086"),
    ("editando_nota.png", "https://lh3.googleusercontent.com/aida/ADBb0uiY-6JpmojHV1wN0ZG8J1TG7twNypnAXwqQX2B-Dv_fePQ0T8YkxHxhtmJZYwz9rT1jDg4SL4gkP3s787eb3g4_k02G9g_4gyYmBzkp5DBtowV7rgN6I0H1JL5a5DbRBllEdCi3U2eShZKq18_h4Db14R05VxXk41tDdg9zSvUOkcgo7Zh2wshm4hlRzi_CKFYg97pkLZ3Gad-7lj37lQHUbzGb_0zFO3t2DuWE6h7i6BYt8sDjw_hsLrzs"),
    ("nueva_nota.html", "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzA1NDdlZDQzYWFiYjRhYjc4OGFhMWI4ZDdhNTA3ODY3EgsSBxDDndnpnB0YAZIBJAoKcHJvamVjdF9pZBIWQhQxNTgzNjAyNjE2ODI1MDY2MjUzOA&filename=&opi=89354086"),
    ("nueva_nota.png", "https://lh3.googleusercontent.com/aida/ADBb0uhSrVib5KI93fv2tfOKneS6gHja23khP491odKOwLQg8gHNYRDnk4ngbSeKaY3fy3PjtTlBjM4UAzpF6QOL4wMUwlxy5GylNe08BHRL2onbnohXJZzB2Etbg-YAUHrdKdGZRsaAfXA4EBNDNUtfGAIE-nL4UlHxPWmPIvyGu8WGXa8diWvUoPo1zY02DNfOB23bSO8F6M8Ul2xx9OudsCPXH4ECriR-MPxxRlSFYoyho47e9SembBtmxxw"),
    ("nueva_lista.html", "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2U3NTQ4YmE0ZTQzYjRlYjJhOThkOTRkYWFkYTJjNzVhEgsSBxDDndnpnB0YAZIBJAoKcHJvamVjdF9pZBIWQhQxNTgzNjAyNjE2ODI1MDY2MjUzOA&filename=&opi=89354086"),
    ("nueva_lista.png", "https://lh3.googleusercontent.com/aida/ADBb0uhbjawRb6ZPrZRy2cSpF8ulBlq75xRp_pe-OFDgjCh7JTzpPbu9aJayLfJseIW0_lIee4UwcOAZwQGphpdc6ifUI961lYHn-Vs2Pf8eLc6AijoNoBGCn7ax5Z3oBXotQI64rtNFhtI9T6HQz_jGUKvUORsUUcyXNqgaecsh0RnN0Qv8JJcrLFrVewqgjJQzDtJ8wSfqylTl1ATR-I_nzADif4YrmgC13X8SMvgrVCmONmr7Ojf4rW8I1akt")
]

for filename, url in files:
    out_path = os.path.join(out_dir, filename)
    print(f"Downloading {filename}...")
    urllib.request.urlretrieve(url, out_path)
print("Done!")
