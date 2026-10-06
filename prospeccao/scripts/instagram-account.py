"""Single account operation. No challenges solved or unconfirmed sends retried."""
import contextlib
import json
import logging
import sys

logging.disable(logging.CRITICAL)


def perform(data, client_factory=None):
    if client_factory is None:
        from instagrapi import Client

        class AccountClient(Client):
            # Upstream normally retries timeouts and resolves challenges. Stop instead.
            def private_request(self, endpoint, data=None, **kwargs):
                headers = dict(kwargs.pop("headers", None) or {})
                if self.authorization:
                    headers["Authorization"] = self.authorization
                return self._send_private_request(endpoint, data=data, headers=headers, **kwargs)

            def challenge_resolve(self, *args, **kwargs):
                from instagrapi.exceptions import ChallengeRequired
                raise ChallengeRequired("Complete verification in Instagram")

        client_factory = AccountClient
    client = client_factory()
    sending = False
    try:
        if data.get("session"):
            client.set_settings(data["session"])
        client.set_retry_config(session_retry_total=0, public_request_retries_count=0)
        if data["action"] == "connect":
            client.login(data["username"], data["password"], verification_code=data.get("code", ""))
        account = client.account_info()
        if str(account.pk) != str(data.get("accountId", account.pk)):
            return {"ok": False, "code": "login", "error": "A conta conectada mudou. Conecte novamente."}
        result = {"ok": True, "username": account.username, "accountId": str(account.pk)}
        if data["action"] == "send":
            target = client.user_info_by_username_v1(data["recipient"])
            if target.username.lower() != data["recipient"].lower() or str(target.pk) == str(account.pk):
                return {"ok": False, "code": "recipient", "error": "Perfil de destino inválido."}
            # One recipient only. A list of several IDs would create a group conversation.
            sending = True
            receipt = client.direct_send(data["message"], user_ids=[target.pk])
            if not receipt.id:
                raise RuntimeError("Missing receipt")
            result["messageId"] = str(receipt.id)
        settings = client.get_settings()
        # The password is needed for login only. Persist solely the session/device state.
        for key in ("password", "verification_code"):
            settings.pop(key, None)
        result["session"] = settings
        return result
    except Exception as error:
        kind = type(error).__name__
        if kind == "TwoFactorRequired":
            settings = client.get_settings()
            settings.pop("password", None)
            settings.pop("verification_code", None)
            return {"ok": False, "code": "two_factor", "session": settings, "error": "Informe o código de autenticação do seu Instagram."}
        if kind in ("BadPassword", "BadCredentials", "TwoFactorCodeInvalid"):
            return {"ok": False, "code": "credentials", "error": "Confira o usuário, a senha e o código do Instagram."}
        if "Challenge" in kind or kind in ("LoginRequired", "ClientLoginRequired", "ClientUnauthorizedError"):
            return {"ok": False, "code": "login", "error": "Abra o Instagram, conclua a verificação solicitada e conecte novamente."}
        if kind in ("FeedbackRequired", "PleaseWaitFewMinutes", "RateLimitError", "ClientThrottledError", "SentryBlock", "ClientForbiddenError"):
            return {"ok": False, "code": "restricted", "error": "O Instagram restringiu esta operação. Os envios foram pausados. Confira sua conta no Instagram."}
        if kind in ("UserNotFound", "DirectMessageRequestsDisabled", "ClientNotFoundError"):
            return {"ok": False, "code": "recipient", "error": "Este perfil não está disponível para receber esta mensagem."}
        return {"ok": False, "code": "unknown", "uncertain": sending, "error": "O Instagram não confirmou a operação. Confira a conversa antes de tentar novamente."}


if __name__ == "__main__":
    data = json.loads(sys.stdin.read())
    # Never forward provider diagnostics, tokens or passwords to stdout/stderr.
    with contextlib.redirect_stdout(sys.stderr):
        result = perform(data)
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
