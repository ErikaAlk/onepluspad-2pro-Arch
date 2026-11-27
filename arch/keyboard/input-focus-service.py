import json
import os
import sys
import traceback
import uuid

import gi

gi.require_version('Atspi', '2.0')
from gi.repository import Atspi, Gio, GLib

NAME = 'org.erhai.InputFocus1'
PATH = '/org/erhai/InputFocus'
XML = '''<node><interface name="org.erhai.InputFocus1">
<method name="GetFocus"><arg type="u" direction="in" name="generation"/>
<arg type="u" direction="in" name="pid"/><arg type="s" direction="out"/></method>
<method name="GetTargets"><arg type="u" direction="in" name="generation"/>
<arg type="u" direction="in" name="pid"/><arg type="s" direction="out"/></method>
<signal name="Changed"><arg type="s"/></signal></interface></node>'''
WINDOW_ROLES = {Atspi.Role.FRAME, Atspi.Role.DIALOG, Atspi.Role.WINDOW}


def fatal_exception(exception_type, exception, tb):
    traceback.print_exception(exception_type, exception, tb)
    os._exit(1)


sys.excepthook = fatal_exception


def identity(accessible):
    if accessible is None or accessible.app is None:
        return None
    return f'{accessible.app.bus_name}{accessible.path}'


class InputFocusService:
    def __init__(self):
        if Atspi.init() != 0:
            raise RuntimeError('无法初始化应用无障碍焦点服务')
        Atspi.set_timeout(250, 250)
        self.desktop = Atspi.get_desktop(0)
        self.epoch = str(uuid.uuid4())
        self.sequence = 0
        self.current = None
        self.connection = None
        self.pending = None
        self.pending_id = 0
        self.requested_pid = 0
        self.pending_scan = False
        self.listener = Atspi.EventListener.new(self.on_event)
        for event in ('object:state-changed:focused', 'object:state-changed:editable',
                      'object:state-changed:defunct', 'object:state-changed:showing',
                      'object:children-changed', 'window:create', 'window:activate', 'window:deactivate', 'window:destroy'):
            if not self.listener.register(event):
                raise RuntimeError(f'无法订阅焦点事件：{event}')
        self.owner = Gio.bus_own_name(Gio.BusType.SESSION, NAME,
            Gio.BusNameOwnerFlags.NONE, self.bus_ready, None, self.name_lost)

    def name_lost(self, connection, name):
        raise RuntimeError(f'焦点服务失去总线名称：{name}')

    def bus_ready(self, connection, name):
        self.connection = connection
        interface = Gio.DBusNodeInfo.new_for_xml(XML).interfaces[0]
        self.registration = connection.register_object(PATH, interface, self.call, None, None)

    def snapshot(self, source, generation=0):
        result = {'epoch': self.epoch, 'sequence': self.sequence,
                  'generation': generation, 'focused': False, 'editable': False,
                  'active': False, 'pid': 0, 'id': '', 'role': 0,
                  'protected': False, 'rect': [0, 0, 0, 0], 'frameSize': [0, 0], 'documentRect': None}
        if source is None or source.app is None:
            return result
        result['id'] = identity(source)
        states = source.get_state_set()
        if states.contains(Atspi.StateType.DEFUNCT):
            return result
        role = source.get_role()
        result['pid'] = source.get_process_id()
        result['role'] = int(role)
        result['protected'] = role == Atspi.Role.PASSWORD_TEXT
        result['focused'] = states.contains(Atspi.StateType.FOCUSED)
        result['editable'] = (states.contains(Atspi.StateType.EDITABLE) or
                              role == Atspi.Role.TERMINAL) and not states.contains(Atspi.StateType.READ_ONLY)
        parent = source
        frame = None
        document = None
        while parent is not None and parent.get_role() != Atspi.Role.APPLICATION:
            if parent.get_role() in WINDOW_ROLES:
                frame = parent
            if parent.get_role() == Atspi.Role.DOCUMENT_WEB:
                document = parent
            parent = parent.get_parent()
        if document is not None:
            rectangle = document.get_component_iface().get_extents(Atspi.CoordType.WINDOW)
            result['documentRect'] = [rectangle.x, rectangle.y, rectangle.width, rectangle.height]
        if frame is not None:
            result['active'] = frame.get_state_set().contains(Atspi.StateType.ACTIVE)
            result['frameId'] = identity(frame)
            rectangle = frame.get_component_iface().get_extents(Atspi.CoordType.WINDOW)
            result['frameSize'] = [rectangle.width, rectangle.height]
        component = source.get_component_iface()
        if component is not None:
            rectangle = component.get_extents(Atspi.CoordType.WINDOW)
            result['rect'] = [rectangle.x, rectangle.y, rectangle.width, rectangle.height]
        return result

    def publish(self):
        self.sequence += 1
        payload = json.dumps(self.snapshot(self.current), separators=(',', ':'))
        if self.connection is not None:
            self.connection.emit_signal(None, PATH, NAME, 'Changed', GLib.Variant('(s)', (payload,)))

    def on_event(self, event):
        source = event.source
        if source is None or not self.requested_pid:
            return
        desktop_event = source == self.desktop
        if desktop_event and not event.type.startswith('object:children-changed'):
            return
        if not desktop_event and (source.app is None or source.get_process_id() != self.requested_pid):
            return
        if event.type.startswith('object:children-changed') or event.type in ('window:create', 'window:activate'):
            current = self.snapshot(self.current)
            if current['pid'] == self.requested_pid and current['focused'] and current['active'] and current['editable']:
                return
            self.pending_scan = True
        elif event.type == 'object:state-changed:focused' and event.detail1 == 1:
            self.current = source
            self.pending = source
        elif self.current is not None and self.current.app is not None:
            source_id = identity(source)
            if source_id == identity(self.current):
                self.pending = source
            elif event.type.startswith('window:'):
                self.pending = self.current
            else:
                return
        else:
            return
        if not self.pending_id:
            self.pending_id = GLib.idle_add(self.process_event)

    def process_event(self):
        self.pending_id = 0
        if self.pending_scan:
            self.pending_scan = False
            self.current = self.find_focus(self.requested_pid)
            self.pending = self.current
        candidate = self.pending
        self.pending = None
        # 旧控件的失焦通知不能清除后来获得焦点的控件。
        snapshot = self.snapshot(candidate)
        if snapshot['focused']:
            self.current = candidate
        elif self.current is not None and candidate is not None and identity(candidate) == identity(self.current):
            self.current = None
        self.publish()
        return GLib.SOURCE_REMOVE

    def find_focus(self, pid):
        desktop = self.desktop
        applications = [desktop.get_child_at_index(i) for i in range(desktop.get_child_count())]
        for application in applications:
            if application is not None and application.get_process_id() == pid:
                focused = self.find_focused_descendant(application)
                if focused is not None:
                    return focused
        return None

    def find_focused_descendant(self, source):
        if source is None:
            return None
        states = source.get_state_set()
        if states.contains(Atspi.StateType.DEFUNCT):
            return None
        role = source.get_role()
        if role in WINDOW_ROLES or role == Atspi.Role.DOCUMENT_WEB:
            # 窗口和文档关系查询启用按需提供的输入节点，不读取内容。
            source.get_relation_set()
        editable = states.contains(Atspi.StateType.EDITABLE) or role == Atspi.Role.TERMINAL
        if editable and states.contains(Atspi.StateType.FOCUSED) and self.snapshot(source)['active']:
            return source
        for index in range(source.get_child_count()):
            focused = self.find_focused_descendant(source.get_child_at_index(index))
            if focused is not None:
                return focused
        return None

    def editable_targets(self, source, generation):
        if source is None:
            return []
        states = source.get_state_set()
        if states.contains(Atspi.StateType.DEFUNCT):
            return []
        targets = []
        if (states.contains(Atspi.StateType.EDITABLE) or source.get_role() == Atspi.Role.TERMINAL) and \
                states.contains(Atspi.StateType.SHOWING) and states.contains(Atspi.StateType.ENABLED):
            target = self.snapshot(source, generation)
            if target['editable'] and target['active']:
                targets.append(target)
        for index in range(source.get_child_count()):
            targets.extend(self.editable_targets(source.get_child_at_index(index), generation))
        return targets

    def call(self, connection, sender, path, interface, method, parameters, invocation):
        generation, pid = parameters.unpack()
        if pid != self.requested_pid:
            if self.pending_id:
                GLib.source_remove(self.pending_id)
            self.pending_id = 0
            self.pending = None
            self.pending_scan = False
            self.current = None
        self.requested_pid = pid
        if self.current is not None and (self.current.app is None or self.current.get_process_id() != pid):
            self.current = None
        snapshot = self.snapshot(self.current, generation)
        if snapshot['pid'] != pid or not snapshot['focused'] or not snapshot['active'] or not snapshot['editable']:
            candidate = self.find_focus(pid) if pid else None
            if candidate is not None:
                self.current = candidate
            snapshot = self.snapshot(candidate, generation)
        self.sequence += 1
        snapshot['sequence'] = self.sequence
        if method == 'GetTargets':
            desktop = self.desktop
            snapshot['targets'] = []
            for index in range(desktop.get_child_count()):
                application = desktop.get_child_at_index(index)
                if application is not None and application.get_process_id() == pid:
                    snapshot['targets'].extend(self.editable_targets(application, generation))
        invocation.return_value(GLib.Variant('(s)', (json.dumps(snapshot, separators=(',', ':')),)))


service = InputFocusService()
GLib.MainLoop().run()
