<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Announcement;
use App\Models\AppNotification;
use Illuminate\Http\Request;

/** Bell notifications, announcements and the activity log for the school top bar. */
class NotificationController extends Controller
{
    private function mine(Request $request)
    {
        $uid = $request->user()->id;

        return AppNotification::where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', $uid));
    }

    public function index(Request $request)
    {
        return response()->json(['data' => $this->mine($request)->orderByDesc('id')->limit(50)->get()]);
    }

    public function readAll(Request $request)
    {
        $this->mine($request)->whereNull('read_at')->update(['read_at' => now()]);

        return response()->json(['message' => 'ok']);
    }

    public function announcements(Request $request)
    {
        $cid = $request->user()->company_id;

        return response()->json(['data' => Announcement::where('is_active', true)
            ->where(fn ($q) => $q->whereNull('company_id')->orWhere('company_id', $cid))
            ->orderByDesc('id')->limit(30)->get()]);
    }

    public function manageAnnouncements(Request $request)
    {
        return response()->json(['data' => Announcement::where('company_id', $request->user()->company_id)->orderByDesc('id')->get()]);
    }

    public function storeAnnouncement(Request $request)
    {
        $data = $request->validate([
            'title'     => ['required', 'string', 'max:255'],
            'body'      => ['nullable', 'string'],
            'audience'  => ['required', 'in:staff,guardians,all'],
            'is_active' => ['boolean'],
        ]);

        return response()->json(Announcement::create($data + ['company_id' => $request->user()->company_id]), 201);
    }

    public function updateAnnouncement(Request $request, $id)
    {
        $a = Announcement::where('company_id', $request->user()->company_id)->findOrFail($id);
        $a->update($request->validate([
            'title'     => ['sometimes', 'string', 'max:255'],
            'body'      => ['nullable', 'string'],
            'audience'  => ['sometimes', 'in:staff,guardians,all'],
            'is_active' => ['boolean'],
        ]));

        return response()->json($a);
    }

    public function destroyAnnouncement(Request $request, $id)
    {
        Announcement::where('company_id', $request->user()->company_id)->findOrFail($id)->delete();

        return response()->json(['message' => 'تم الحذف.']);
    }

    public function activity(Request $request)
    {
        return response()->json(ActivityLog::with('user:id,name')
            ->when($request->q, fn ($q, $t) => $q->where('description', 'like', "%{$t}%"))
            ->when($request->user_id, fn ($q, $v) => $q->where('user_id', $v))
            ->orderByDesc('id')->paginate(40));
    }
}
