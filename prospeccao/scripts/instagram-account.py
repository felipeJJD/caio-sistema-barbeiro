"""Single account operation. No challenges solved or unconfirmed sends retried."""
import contextlib
import json
import logging
import sys

logging.disable(logging.CRITICAL)


def connection_settings(client):
    settings = client.get_settings()
    for key in ("password", "verification_code"):
        settings.pop(key, None)
    return settings


def failure(error, action, sending=False):
    kind = type(error).__name__
    response = getattr(error, "response", None)
    status = getattr(response, "status_code", None)
    diagnostics = {"errorType": kind[:80], "httpStatus": status if isinstance(status, int) else None}
    if kind == "TwoFactorRequired":
        code, message = "two_factor", "Informe o código de autenticação do seu Instagram."
    elif kind in ("BadPassword", "BadCredentials", "TwoFactorCodeInvalid"):
        code, message = "credentials", "O Instagram não validou as credenciais. Confira o usuário, a senha e o código."
    elif "Challenge" in kind or kind in ("LoginRequired", "ClientLoginRequired", "ClientUnauthorizedError"):
        code, message = "login", "O Instagram pediu uma verificação. Abra o app do Instagram, conclua a confirmação solicitada e depois conecte novamente."
    elif kind in ("PleaseWaitFewMinutes", "RateLimitError", "ClientThrottledError"):
        code = "rate_limited"
        message = "O Instagram pediu uma pausa antes de uma nova tentativa de conexão. Aguarde e confira sua conta no app." if action == "connect" else "O Instagram pediu uma pausa. Os próximos envios foram pausados."
    elif kind == "ClientForbiddenError":
        code = "access_denied"
        message = "O Instagram recusou esta tentativa de conexão. Abra o app e confira se existe um aviso de segurança ou uma confirmação de login." if action == "connect" else "O Instagram recusou esta operação. Os próximos envios foram pausados. Confira sua conta no app."
    elif kind in ("FeedbackRequired", "SentryBlock"):
        code = "restricted"
        message = "O Instagram restringiu esta tentativa de conexão. Confira os avisos na sua conta antes de tentar novamente." if action == "connect" else "O Instagram restringiu esta operação. Os próximos envios foram pausados. Confira sua conta no app."
    elif kind in ("UserNotFound", "DirectMessageRequestsDisabled", "ClientNotFoundError") and action == "send":
        code, message = "recipient", "Este perfil não está disponível para receber esta mensagem."
    else:
        code = "unknown"
        message = "Não foi possível confirmar a conexão com o Instagram. Confira sua conta no app antes de tentar novamente." if action == "connect" else "O Instagram não confirmou a operação. Confira a conversa antes de tentar novamente."
    result = {"ok": False, "code": code, "error": message, "uncertain": sending and code == "unknown", **diagnostics}
    if code == "rate_limited":
        # A local pause, not a prediction of Instagram's account limits.
        header = str(getattr(response, "headers", {}).get("Retry-After", ""))
        result["retryAfterSeconds"] = min(86400, max(300, int(header))) if header.isdigit() else 300
    return result


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
        # The password is needed for login only. Persist solely the session/device state.
        result["session"] = connection_settings(client)
        return result
    except Exception as error:
        result = failure(error, data["action"], sending)
        # Reuse the same device for the next user-authorized attempt after verification.
        # Never solve a checkpoint or retry a refused request automatically.
        if data["action"] == "connect":
            result["session"] = connection_settings(client)
        return result


if __name__ == "__main__":
    data = json.loads(sys.stdin.read())
    # Never forward provider diagnostics, tokens or passwords to stdout/stderr.
    with contextlib.redirect_stdout(sys.stderr):
        result = perform(data)
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
