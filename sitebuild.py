import os, re, subprocess
R='/home/claude/sudam-site/'
for cmd in ['python3 /home/claude/omok/build.py','python3 /home/claude/baduk/build.py','python3 /home/claude/janggi/build.py','python3 /home/claude/tiletalk/build.py']:
    subprocess.run(cmd, shell=True, check=True, stdout=subprocess.DEVNULL)
os.makedirs(R+'sudoku', exist_ok=True)
open(R+'sudoku/index.html','w').write(open('/home/claude/sudoku03/index.html').read())
HEAD = '<link rel="manifest" href="../manifest.webmanifest"><link rel="icon" href="../icons/favicon.png"><link rel="apple-touch-icon" href="../icons/apple-180.png"><meta name="theme-color" content="#A8322D">'
TAIL = "<script>if('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js').catch(function(){});</script>"
for g in ['omok','baduk','janggi','tile','sudoku']:
    p=R+g+'/index.html'; s=open(p).read()
    if 'manifest.webmanifest' not in s: s=s.replace('</head>', HEAD+'\n</head>',1)
    if "register('../sw.js')" not in s:
        i=s.rfind('</body>'); s=s[:i]+TAIL+'\n'+s[i:]
    open(p,'w').write(s)
# 버전 올리기 (sw 캐시 갱신)
import time
sw=open(R+'sw.js').read(); sw=re.sub(r"const V = 'sudam-[^']*';", "const V = 'sudam-%s';" % time.strftime('%Y%m%d%H%M%S'), sw); open(R+'sw.js','w').write(sw)
for f in ['vendor/firebase-app-compat.js','vendor/firebase-database-compat.js']:
    s=open(R+f).read(); s=re.sub(r'//# sourceMappingURL=\S+','',s); open(R+f,'w').write(s)
print('built', sorted(os.listdir(R)))
