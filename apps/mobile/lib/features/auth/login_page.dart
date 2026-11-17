import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/session.dart';
import '../../core/widgets.dart';
import '../platform/google_login.dart';
import '../platform/links.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _hide = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    context.read<GoogleLoginController>().clearError();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<SessionController>().login(_email.text, _password.text);
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openWeb(Uri url) async {
    if (!await openExternal(url) && mounted) showMessage(context, 'Tidak bisa membuka browser.');
  }

  /// Tautan undangan hanya bisa diterima lewat web; tempel tautannya di sini dan halaman yang benar dibuka.
  Future<void> _askInvitation() async {
    final controller = TextEditingController();
    final token = await showDialog<String>(
      context: context,
      builder: (c) {
        String? problem;
        return StatefulBuilder(
          builder: (c, setState) => AlertDialog(
            title: const Text('Tautan undangan'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Tempel tautan undangan dari admin SSB. Pendaftaran dilanjutkan di browser.'),
                const SizedBox(height: 12),
                TextField(
                  controller: controller,
                  autofocus: true,
                  keyboardType: TextInputType.url,
                  decoration: InputDecoration(labelText: 'Tautan undangan', border: const OutlineInputBorder(), errorText: problem),
                ),
              ],
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(c), child: const Text('Batal')),
              TextButton(
                onPressed: () {
                  final t = parseInvitationToken(controller.text);
                  if (t == null) {
                    setState(() => problem = 'Tautan tidak dikenali. Salin seluruh tautan dari admin.');
                  } else {
                    Navigator.pop(c, t);
                  }
                },
                child: const Text('Buka'),
              ),
            ],
          ),
        );
      },
    );
    controller.dispose();
    if (token != null) await _openWeb(invitationUrl(token));
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final google = context.watch<GoogleLoginController>();
    final busy = _busy || google.busy;
    final error = _error ?? google.error;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Icon(Icons.sports_soccer, size: 56, color: scheme.primary),
                    const SizedBox(height: 12),
                    Text('SSB App', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text('Masuk untuk pelatih dan orang tua', textAlign: TextAlign.center, style: TextStyle(color: scheme.outline)),
                    const SizedBox(height: 32),
                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
                      validator: (v) => (v == null || !v.contains('@')) ? 'Isi email yang valid' : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _password,
                      obscureText: _hide,
                      autofillHints: const [AutofillHints.password],
                      onFieldSubmitted: (_) => _submit(),
                      decoration: InputDecoration(
                        labelText: 'Kata sandi',
                        border: const OutlineInputBorder(),
                        suffixIcon: IconButton(
                          tooltip: _hide ? 'Tampilkan' : 'Sembunyikan',
                          icon: Icon(_hide ? Icons.visibility : Icons.visibility_off),
                          onPressed: () => setState(() => _hide = !_hide),
                        ),
                      ),
                      validator: (v) => (v == null || v.isEmpty) ? 'Isi kata sandi' : null,
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(onPressed: () => _openWeb(forgotPasswordUrl()), child: const Text('Lupa kata sandi?')),
                    ),
                    if (error != null) ...[
                      const SizedBox(height: 4),
                      Text(error, style: TextStyle(color: scheme.error)),
                    ],
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: busy ? null : _submit,
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                      child: _busy ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Masuk'),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: busy ? null : google.open,
                      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                      icon: google.busy ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.account_circle_outlined),
                      label: const Text('Masuk dengan Google'),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Belum punya akun? Minta tautan undangan dari admin SSB.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: scheme.outline, fontSize: 13),
                    ),
                    TextButton(onPressed: _askInvitation, child: const Text('Punya tautan undangan?')),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
