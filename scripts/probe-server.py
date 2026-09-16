"""服务器端口连通性探测（部署前检查用）"""
import socket

ip = "8.137.195.155"
ports = [22, 80, 443, 3001, 3389, 8443, 8888]

for p in ports:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(3)
    try:
        s.connect((ip, p))
        print(f"port {p:>5} : OPEN")
    except socket.timeout:
        print(f"port {p:>5} : TIMEOUT (被丢包/安全组未放行)")
    except ConnectionRefusedError:
        print(f"port {p:>5} : REFUSED (主机可达但无监听)")
    except Exception as e:
        print(f"port {p:>5} : {type(e).__name__} {e}")
    finally:
        s.close()
