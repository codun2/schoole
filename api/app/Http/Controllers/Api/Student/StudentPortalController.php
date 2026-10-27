<?php

namespace App\Http\Controllers\Api\Student;

use App\Http\Controllers\Api\School\MarkController;
use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Support\StudentView;
use Illuminate\Http\Request;

/** Student portal (role=student): a student sees only their own data. */
class StudentPortalController extends Controller
{
    private function student(Request $request): Student
    {
        return Student::with(['grade:id,name_ar', 'section:id,name', 'guardian:id,name,phone'])->where('user_id', $request->user()->id)->firstOrFail();
    }

    public function home(Request $request)
    {
        return response()->json(StudentView::home($this->student($request), $request->user()->company));
    }

    public function timetable(Request $request)
    {
        return response()->json(StudentView::timetable($this->student($request), $request->user()->company->settings ?? []));
    }

    public function assignments(Request $request)
    {
        return response()->json(['data' => StudentView::assignments($this->student($request))]);
    }

    public function attendance(Request $request)
    {
        $data = $request->validate(['from' => ['nullable', 'date'], 'to' => ['nullable', 'date']]);

        return response()->json(StudentView::attendance($this->student($request), $data['from'] ?? null, $data['to'] ?? null));
    }

    public function reportCard(Request $request)
    {
        return app(MarkController::class)->reportCard($request, $this->student($request)->id);
    }

    public function notes(Request $request)
    {
        return response()->json(['data' => StudentView::notes($this->student($request))]);
    }
}
