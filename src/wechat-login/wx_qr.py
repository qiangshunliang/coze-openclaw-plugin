#!/usr/bin/env python3
"""
微信登录二维码生成脚本

功能：
1. 检测 openclaw-weixin 插件是否已安装
2. 如果未安装，自动执行 npx -y @tencent-weixin/openclaw-weixin-cli install
3. 监控日志，当检测到"正在启动微信扫码登录..."时提取二维码
4. 生成二维码 PNG 文件
5. 启动独立进程监测登录成功日志，自动重启网关
"""

import subprocess
import time
import os
import json
import sys
from PIL import Image

# 配置
LOG_FILE = "/tmp/wx_login.log"
OUTPUT_FILE = "/workspace/projects/workspace/weixin_qrcode.png"
CONFIG_FILE = "/workspace/projects/openclaw.json"
RESTART_SCRIPT = "/workspace/projects/scripts/restart.sh"

# 登录成功关键字
SUCCESS_KEYWORDS = [
    "与微信连接成功",
    "微信连接成功",
    "登录成功",
    "✅ 与微信连接成功",
    "Login confirmed",
    "connected: true",
]


def is_weixin_plugin_installed():
    """检测 openclaw-weixin 插件是否已安装"""
    try:
        # 方法1: 通过 openclaw plugins list 检测
        result = subprocess.run(
            ["openclaw", "--log-level", "error", "plugins", "list"],
            capture_output=True,
            text=True,
            timeout=30
        )
        if "openclaw-weixin" in result.stdout or "openclaw-weixin" in result.stderr:
            return True
    except Exception:
        pass
    
    try:
        # 方法2: 检查配置文件
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                config = json.load(f)
            
            # 检查 plugins.installs 中是否有 openclaw-weixin
            installs = config.get("plugins", {}).get("installs", {})
            if "openclaw-weixin" in installs:
                return True
            
            # 检查 plugins.entries 中是否启用
            entries = config.get("plugins", {}).get("entries", {})
            if "openclaw-weixin" in entries and entries["openclaw-weixin"].get("enabled"):
                return True
    except Exception:
        pass
    
    return False


def install_weixin_plugin():
    """安装 openclaw-weixin 插件"""
    print("正在安装微信插件...")
    print("执行: npx -y @tencent-weixin/openclaw-weixin-cli install")
    
    # 清理旧日志
    if os.path.exists(LOG_FILE):
        os.remove(LOG_FILE)
    
    # 后台执行安装命令
    with open(LOG_FILE, "w") as f:
        process = subprocess.Popen(
            ["npx", "-y", "@tencent-weixin/openclaw-weixin-cli", "install"],
            stdout=f,
            stderr=subprocess.STDOUT,
            bufsize=0  # 无缓冲，实时写入
        )
    
    return process


def start_login():
    """启动微信登录流程"""
    print("正在启动微信登录...")
    
    # 清理旧日志
    if os.path.exists(LOG_FILE):
        os.remove(LOG_FILE)
    
    # 后台执行登录命令
    with open(LOG_FILE, "w") as f:
        process = subprocess.Popen(
            ["openclaw", "channels", "login", "--channel", "openclaw-weixin"],
            stdout=f,
            stderr=subprocess.STDOUT,
            bufsize=0
        )
    
    return process


def start_success_monitor():
    """
    启动独立进程监测登录成功日志
    即使主进程退出，监测进程仍会继续运行
    """
    # 使用 subprocess 启动独立的后台监测进程
    monitor_code = '''
import subprocess
import time
import os
import sys

LOG_FILE = "/tmp/wx_login.log"
RESTART_SCRIPT = "/workspace/projects/scripts/restart.sh"
SUCCESS_KEYWORDS = [
    "与微信连接成功",
    "微信连接成功",
    "登录成功",
    "✅ 与微信连接成功",
    "Login confirmed",
    "connected: true",
]

def main():
    # 写入 PID 文件，方便后续管理
    pid_file = "/tmp/wx_login_monitor.pid"
    with open(pid_file, "w") as f:
        f.write(str(os.getpid()))
    
    print("[监测进程] 启动登录成功监测...")
    
    start_time = time.time()
    timeout = 300  # 5分钟超时
    last_size = 0
    
    while time.time() - start_time < timeout:
        if not os.path.exists(LOG_FILE):
            time.sleep(1)
            continue
        
        try:
            current_size = os.path.getsize(LOG_FILE)
            if current_size != last_size:
                last_size = current_size
                
                with open(LOG_FILE, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                
                for keyword in SUCCESS_KEYWORDS:
                    if keyword in content:
                        print(f"[监测进程] 检测到登录成功: {keyword}")
                        
                        # 等待一下让登录流程完全结束
                        time.sleep(2)
                        
                        # 执行重启脚本
                        if os.path.exists(RESTART_SCRIPT):
                            print("[监测进程] 正在重启网关...")
                            try:
                                result = subprocess.run(
                                    ["bash", RESTART_SCRIPT],
                                    capture_output=True,
                                    text=True,
                                    timeout=30
                                )
                                if result.returncode == 0:
                                    print("[监测进程] ✓ 网关重启成功")
                                else:
                                    print(f"[监测进程] ✗ 网关重启失败: {result.stderr}")
                            except Exception as e:
                                print(f"[监测进程] ✗ 重启脚本执行错误: {e}")
                        else:
                            print(f"[监测进程] ✗ 重启脚本不存在: {RESTART_SCRIPT}")
                        
                        # 清理 PID 文件
                        try:
                            os.remove(pid_file)
                        except:
                            pass
                        
                        return
        
        except Exception as e:
            print(f"[监测进程] 监控异常: {e}")
        
        time.sleep(1)
    
    print("[监测进程] 监测超时退出")
    try:
        os.remove(pid_file)
    except:
        pass

if __name__ == "__main__":
    main()
'''
    
    # 启动独立的后台进程
    process = subprocess.Popen(
        [sys.executable, "-c", monitor_code],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True  # 创建新的进程组，独立于父进程
    )
    
    print(f"[后台监测] 已启动独立监测进程 (PID: {process.pid})")
    print("[后台监测] 登录成功后将自动重启网关")
    
    return process


def wait_for_qr_keyword(timeout=60):
    """等待日志中出现二维码相关关键字"""
    print("等待二维码生成...")
    
    start_time = time.time()
    last_size = 0
    
    while time.time() - start_time < timeout:
        if not os.path.exists(LOG_FILE):
            time.sleep(0.5)
            continue
        
        # 检查文件大小变化
        current_size = os.path.getsize(LOG_FILE)
        if current_size != last_size:
            last_size = current_size
            
            with open(LOG_FILE, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            
            # 检测关键字
            if "正在启动微信扫码登录" in content or "启动微信扫码登录" in content:
                print("检测到二维码生成信号")
                return True
            
            # 备选：检测二维码块字符
            if "█" in content or "▄" in content or "▀" in content:
                print("检测到二维码数据")
                return True
        
        time.sleep(0.5)
    
    return False


def extract_qr_from_log():
    """从日志中提取二维码"""
    if not os.path.exists(LOG_FILE):
        return None
    
    with open(LOG_FILE, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
    
    # 提取二维码行
    lines = content.split("\n")
    qr_lines = [l for l in lines if l and ("█" in l or "▄" in l or "▀" in l)]
    
    # 取最后 21 行（完整二维码）
    qr_lines = qr_lines[-21:]
    
    if len(qr_lines) < 10:
        print(f"警告: 只找到 {len(qr_lines)} 行二维码数据")
        return None
    
    print(f"提取到 {len(qr_lines)} 行二维码数据")
    return qr_lines


def generate_qr_image(qr_lines):
    """生成二维码图片"""
    if not qr_lines:
        return False
    
    h = len(qr_lines) * 2
    w = max(len(l) for l in qr_lines)
    scale = 12
    
    img = Image.new("1", (w * scale, h * scale), 1)  # 白色背景
    px = img.load()
    
    for y, line in enumerate(qr_lines):
        for x, char in enumerate(line):
            # Unicode 块字符编码
            if char == "█":
                top, bottom = 0, 0  # 全黑
            elif char == "▄":
                top, bottom = 1, 0  # 上白下黑
            elif char == "▀":
                top, bottom = 0, 1  # 上黑下白
            else:
                top, bottom = 1, 1  # 全白
            
            for dy in range(scale):
                for dx in range(scale):
                    px[x * scale + dx, y * 2 * scale + dy] = top
                    if y * 2 * scale + scale + dy < h * scale:
                        px[x * scale + dx, y * 2 * scale + scale + dy] = bottom
    
    img.save(OUTPUT_FILE)
    return True


def print_qr_ascii(qr_lines):
    """打印 ASCII 二维码"""
    print("\n" + "=" * 50)
    print("请使用微信扫描以下二维码")
    print("=" * 50 + "\n")
    
    for line in qr_lines:
        print(line)
    
    print("\n" + "=" * 50)


def main():
    """主函数"""
    print("=" * 50)
    print("微信登录二维码生成工具")
    print("=" * 50 + "\n")
    
    # 清理旧进程
    subprocess.run(["pkill", "-f", "channels login"], capture_output=True)
    subprocess.run(["pkill", "-f", "openclaw-weixin-cli"], capture_output=True)
    
    # 清理旧的监测进程
    pid_file = "/tmp/wx_login_monitor.pid"
    if os.path.exists(pid_file):
        try:
            with open(pid_file, "r") as f:
                old_pid = f.read().strip()
            subprocess.run(["kill", old_pid], capture_output=True)
            os.remove(pid_file)
        except:
            pass
    
    time.sleep(0.5)
    
    # Step 1: 检测插件是否安装
    print("Step 1: 检测微信插件安装状态...")
    if is_weixin_plugin_installed():
        print("✓ 微信插件已安装")
        # 启动登录流程
        process = start_login()
    else:
        print("✗ 微信插件未安装")
        print("Step 2: 自动安装微信插件...")
        process = install_weixin_plugin()
    
    # 启动独立监测进程（监测登录成功后自动重启网关）
    # 注意：这个进程独立运行，即使主进程退出也会继续监测
    start_success_monitor()
    
    # Step 2: 等待二维码生成
    print("\nStep 3: 等待二维码生成...")
    if not wait_for_qr_keyword(timeout=90):
        print("错误: 等待二维码超时")
        
        # 打印日志帮助调试
        if os.path.exists(LOG_FILE):
            print("\n=== 日志内容 ===")
            with open(LOG_FILE, "r", encoding="utf-8", errors="ignore") as f:
                print(f.read()[-2000:])
        
        return 1
    
    # 等待二维码完整输出
    time.sleep(2)
    
    # Step 3: 提取二维码
    print("\nStep 4: 提取二维码...")
    qr_lines = extract_qr_from_log()
    
    if not qr_lines:
        print("错误: 无法提取二维码")
        return 1
    
    # Step 4: 生成图片
    print("\nStep 5: 生成二维码图片...")
    if generate_qr_image(qr_lines):
        print(f"✓ 二维码已保存到: {OUTPUT_FILE}")
    else:
        print("✗ 生成图片失败")
        return 1
    
    # Step 5: 打印 ASCII 二维码
    print_qr_ascii(qr_lines)
    
    # 用户提示
    print("\n📌 重要提示:")
    print("1. 打开微信 App，扫描上方二维码")
    print("2. 在微信中确认登录授权")
    print("3. 绑定成功后，系统将自动重启网关")
    print("4. 请等待 1-5 分钟让微信生效")
    print("5. 之后即可通过微信与 OpenClaw 对话")
    print("")
    
    return 0


if __name__ == "__main__":
    try:
        exit(main())
    except KeyboardInterrupt:
        print("\n用户取消")
        exit(130)
    except Exception as e:
        print(f"\n错误: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
