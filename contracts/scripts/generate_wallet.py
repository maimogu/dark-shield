from eth_account import Account
import json
import os

account = Account.create()
wallet_info = {
    "address": account.address,
    "privateKey": account.key.hex()
}

output_path = os.path.join(os.path.dirname(__file__), "..", "deployer-wallet.json")
with open(output_path, 'w') as f:
    json.dump(wallet_info, f, indent=2)

print(f"钱包信息已保存到: {output_path}")
print(f"钱包地址: {wallet_info['address']}")
print(f"私钥已保存到文件，请查看")
