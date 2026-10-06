import runpy
from types import SimpleNamespace
adapter = runpy.run_path('scripts/instagram-account.py')
perform, failure = adapter['perform'], adapter['failure']
class FakeClient:
    sends = 0
    failing = False
    mismatch = False
    def set_settings(self, settings): self.settings = settings
    def set_retry_config(self, **kwargs): assert kwargs['session_retry_total'] == 0
    def login(self, username, password, verification_code=''): assert password == 'fixture-password'
    def account_info(self): return SimpleNamespace(pk=42, username='sender')
    def user_info_by_username_v1(self, username): return SimpleNamespace(pk=99, username='wrong' if self.mismatch else username)
    def direct_send(self, text, user_ids):
        assert user_ids == [99]
        assert 'https://cortouanotou.com.br' in text
        type(self).sends += 1
        if self.failing: raise TimeoutError('fixture')
        return SimpleNamespace(id='receipt-1')
    def get_settings(self): return {'sessionid': 'fixture', 'password': 'fixture-password'}
data = {'action': 'send', 'session': {'sessionid': 'fixture'}, 'accountId': '42', 'recipient': 'barber', 'message': 'Oi https://cortouanotou.com.br/comece'}
result = perform(data, FakeClient)
assert result['messageId'] == 'receipt-1' and 'password' not in result['session'] and FakeClient.sends == 1
FakeClient.failing = True
result = perform(data, FakeClient)
assert result['uncertain'] is True and FakeClient.sends == 2 and 'fixture' not in result['error']
FakeClient.mismatch = True
assert perform(data, FakeClient)['code'] == 'recipient' and FakeClient.sends == 2
assert perform({**data, 'accountId': 'wrong'}, FakeClient)['code'] == 'login' and FakeClient.sends == 2
for kind, expected in [('ClientForbiddenError', 'access_denied'), ('PleaseWaitFewMinutes', 'rate_limited'), ('RateLimitError', 'rate_limited'), ('ClientThrottledError', 'rate_limited'), ('FeedbackRequired', 'restricted'), ('SentryBlock', 'restricted'), ('ChallengeRequired', 'login'), ('TwoFactorRequired', 'two_factor'), ('BadPassword', 'credentials')]:
    error = type(kind, (Exception,), {})('fixture-secret-provider-message')
    error.response = SimpleNamespace(status_code=403 if kind == 'ClientForbiddenError' else 429, headers={})
    result = failure(error, 'connect')
    assert result['code'] == expected and 'pausados' not in result['error']
    assert 'fixture-secret' not in str(result) and not result['uncertain']
    if expected == 'rate_limited': assert result['retryAfterSeconds'] == 300
class RejectedClient(FakeClient):
    def login(self, *args, **kwargs): raise type('ClientForbiddenError', (Exception,), {})('fixture-secret')
    def get_settings(self): return {'uuid': 'same-fixture-device', 'password': 'fixture-password', 'verification_code': '123456'}
result = perform({'action': 'connect', 'username': 'sender', 'password': 'fixture-password'}, RejectedClient)
assert result['session'] == {'uuid': 'same-fixture-device'} and result['code'] == 'access_denied'
assert FakeClient.sends == 2 and 'pausados' not in result['error']
print('Instagram adapter OK')
