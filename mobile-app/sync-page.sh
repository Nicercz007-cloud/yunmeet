#!/usr/bin/env bash
# 把网页版 yunmeet.html 同步进 APK（www/），并打两个壳级补丁：
# 1) 复制邀请链接固定指向网页版地址（App 内 origin 是 https://localhost，不能当邀请地址发给别人）
# 2) 隐藏"本地模式"提示芯片（对 App 用户是误导）
set -e
cd "$(dirname "$0")"
cp ../yunmeet.html www/yunmeet.html
perl -0pi -e 's|base = location\.origin \+ location\.pathname;|base = "https://nicercz007-cloud.github.io/yunmeet/yunmeet.html";|' www/yunmeet.html
perl -0pi -e 's|<head>|<head><style>#localChip{display:none!important}</style>|' www/yunmeet.html
grep -q "nicercz007-cloud.github.io/yunmeet/yunmeet.html" www/yunmeet.html
grep -q "localChip{display:none" www/yunmeet.html
echo "www/yunmeet.html 已同步并打补丁"
