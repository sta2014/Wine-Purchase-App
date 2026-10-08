"""Package only application files; never bundle private inventories, databases or secrets."""
from pathlib import Path
import os, subprocess, zipfile, shutil
root=Path(__file__).resolve().parents[1]
go=os.environ.get('WINE_GO',str(root/'.local/tools/go/bin/go'))
build=root/'.local/desktop-build'; build.mkdir(parents=True,exist_ok=True)
launcher=build/'Start Wine.exe'
env={**os.environ,'GOOS':'windows','GOARCH':'amd64','CGO_ENABLED':'0','GO111MODULE':'off','GOMAXPROCS':'2','GOFLAGS':'-p=2','GOCACHE':str(root/'.local/tools/go-cache')}
subprocess.run([go,'build','-trimpath','-ldflags=-s -w','-o',str(launcher),str(root/'desktop/launcher/main.go')],env=env,check=True)
out=root/'public/downloads/wine-windows.zip';out.parent.mkdir(parents=True,exist_ok=True)
files=[root/'package.json',root/'desktop/Read me.txt',launcher]
files += [p for d in ['dist','server','src/engine'] for p in (root/d).rglob('*') if p.is_file() and not (d=='dist' and 'downloads' in p.relative_to(root/'dist').parts)]
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as archive:
 for path in files:
  if path==launcher:name='Start Wine.exe'
  elif path==root/'desktop/Read me.txt':name='Read me.txt'
  else:name=str(path.relative_to(root))
  archive.write(path,'Wine Purchasing Intelligence/'+name)
(root/'dist/downloads').mkdir(exist_ok=True)
shutil.copy2(out,root/'dist/downloads/wine-windows.zip')
print(f'Packaged {len(files)} application files; {out.stat().st_size:,} bytes; no private inventory or database included.')
