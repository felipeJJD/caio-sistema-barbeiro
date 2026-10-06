import runpy
from types import SimpleNamespace
perform = runpy.run_path('scripts/instagram-account.py')['perform']
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
print('Instagram adapter OK')
