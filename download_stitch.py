import urllib.request
import os

urls = {
    "login": "https://contribution.usercontent.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzI5ZWJmOTE3NDBhMjQ0MmI5MmNkYmE3OGEzM2E5OGE1EgsSBxDDndnpnB0YAZIBJAoKcHJvamVjdF9pZBIWQhQxNTM2OTk5NTc1MzIzNDAzNTM5MA&filename=&opi=89354086",
    "dashboard": "https://contribution.usercontent.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzNkN2ExM2JlZTY3NTRiOGY5MjY4NjdjOWI0MmE5NGFlEgsSBxDDndnpnB0YAZIBJAoKcHJvamVjdF9pZBIWQhQxNTM2OTk5NTc1MzIzNDAzNTM5MA&filename=&opi=89354086",
    "profile": "https://contribution.usercontent.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2EwZTY0NmQxOGU3MjQxMzY4ZjE5ODY4YTZiYjdiZTFlEgsSBxDDndnpnB0YAZIBJAoKcHJvamVjdF9pZBIWQhQxNTM2OTk5NTc1MzIzNDAzNTM5MA&filename=&opi=89354086",
    "recipe_details": "https://contribution.usercontent.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2ZmNDcxYTc5OGRhYzRjMjM4OGY3NzM4OGQyMzI2MzBmEgsSBxDDndnpnB0YAZIBJAoKcHJvamVjdF9pZBIWQhQxNTM2OTk5NTc1MzIzNDAzNTM5MA&filename=&opi=89354086",
    "sharing_modal": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzVhYWQ2Y2FhN2NiNzRhMWJiZjFkYzgzOTVkMjMwOTkxEgsSBxDDndnpnB0YAZIBJAoKcHJvamVjdF9pZBIWQhQxNTM2OTk5NTc1MzIzNDAzNTM5MA&filename=&opi=89354086",
    "cooking_steps": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzQyYjU4ZjFiNWUxOTRiODM5ZjJjMjBlNTFjMGU4MzUzEgsSBxDDndnpnB0YAZIBJAoKcHJvamVjdF9pZBIWQhQxNTM2OTk5NTc1MzIzNDAzNTM5MA&filename=&opi=89354086",
    "ocr_scanner": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2QwNzg1MGE1YzkyMzQ3YTg5ZGQ4ODk4NDQ1YzQzNjUzEgsSBxDDndnpnB0YAZIBJAoKcHJvamVjdF9pZBIWQhQxNTM2OTk5NTc1MzIzNDAzNTM5MA&filename=&opi=89354086",
    "landing_page": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzY0ODBkNzkxMjU0ODQ0MGVhZDcxMzY1MmNhMDcwY2ZlEgsSBxDDndnpnB0YAZIBJAoKcHJvamVjdF9pZBIWQhQxNTM2OTk5NTc1MzIzNDAzNTM5MA&filename=&opi=89354086"
}

if not os.path.exists('stitch_downloads'):
    os.makedirs('stitch_downloads')

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

for name, url in urls.items():
    print(f"Downloading {name}...")
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as response:
            content = response.read().decode('utf-8')
            with open(f"stitch_downloads/{name}.html", "w", encoding="utf-8") as f:
                f.write(content)
            print(f"  Successfully downloaded {name}")
    except Exception as e:
        print(f"  Failed to download {name}: {e}")
