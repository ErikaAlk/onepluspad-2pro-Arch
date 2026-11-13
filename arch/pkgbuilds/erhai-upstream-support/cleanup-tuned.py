from tuned.utils.commands import commands

manager = commands()
profile, manual = manager.get_active_profile()
owned = {'erhai-power-saver', 'erhai-balanced', 'erhai-performance'}
selected = (profile or '').split()
if owned.intersection(selected):
    remaining = [name for name in selected if name not in owned]
    manager.save_active_profile(' '.join(remaining) or 'balanced', manual)
