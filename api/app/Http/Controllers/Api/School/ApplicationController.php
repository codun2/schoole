<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Api\ResourceController;
use App\Models\Application;
use App\Models\Guardian;
use App\Models\Section;
use App\Models\Student;
use App\Support\Activity;
use App\Support\Numbering;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Admission requests (online form or office) → accepted into a real student + guardian. */
class ApplicationController extends ResourceController
{
    protected string $model = Application::class;

    protected array $search = ['student_name', 'guardian_name', 'guardian_phone', 'national_id'];

    protected array $filters = ['status', 'grade_id', 'source'];

    protected array $with = ['grade:id,name_ar,name_en'];

    protected bool $yearScoped = true;

    protected string $label = 'طلب تسجيل';

    protected function rules(Request $request, ?Model $record): array
    {
        $req = $record ? 'sometimes' : 'required';

        return [
            'student_name'         => [$req, 'string', 'max:255'],
            'student_name_en'      => ['nullable', 'string', 'max:255'],
            'gender'               => ['nullable', 'in:male,female'],
            'birth_date'           => ['nullable', 'date'],
            'nationality'          => ['nullable', 'string', 'max:80'],
            'national_id'          => ['nullable', 'string', 'max:40'],
            'grade_id'             => ['nullable', 'integer', $this->owned('grades')],
            'previous_school'      => ['nullable', 'string', 'max:255'],
            'guardian_name'        => [$req, 'string', 'max:255'],
            'guardian_name_en'     => ['nullable', 'string', 'max:255'],
            'guardian_phone'       => [$req, 'string', 'max:40'],
            'guardian_national_id' => ['nullable', 'string', 'max:40'],
            'guardian_email'       => ['nullable', 'email'],
            'guardian_relation'    => ['nullable', 'string', 'max:40'],
            'notes'                => ['nullable', 'string'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        if (! $record) {
            $data['source'] = 'office';
        }

        return $data;
    }

    public function accept(Request $request, $id)
    {
        $app = $this->find($id);
        if ($app->status !== 'new') {
            return response()->json(['message' => 'تمت معالجة هذا الطلب مسبقاً.'], 422);
        }
        $data = $request->validate([
            'section_id' => ['nullable', 'integer', $this->owned('sections')],
        ]);

        $student = DB::transaction(function () use ($app, $data) {
            $guardian = ($app->guardian_national_id ? Guardian::where('national_id', $app->guardian_national_id)->first() : null)
                ?? Guardian::where('phone', $app->guardian_phone)->first()
                ?? Guardian::create([
                    'name'        => $app->guardian_name,
                    'phone'       => $app->guardian_phone,
                    'national_id' => $app->guardian_national_id,
                    'email'       => $app->guardian_email,
                    'relation'    => $app->guardian_relation,
                    'nationality' => $app->nationality,
                ]);

            $section = ! empty($data['section_id']) ? Section::find($data['section_id']) : null;
            $student = Student::create([
                'academic_year_id' => $app->academic_year_id,
                'guardian_id'      => $guardian->id,
                'grade_id'         => $section?->grade_id ?? $app->grade_id,
                'section_id'       => $section?->id,
                'student_no'       => Numbering::next(Student::class, 'ST-', 5, 'student_no'),
                'name'             => $app->student_name,
                'national_id'      => $app->national_id,
                'gender'           => $app->gender,
                'birth_date'       => $app->birth_date,
                'nationality'      => $app->nationality,
                'status'           => 'active',
                'registered_at'    => now()->toDateString(),
                'notes'            => $app->previous_school ? 'المدرسة السابقة: '.$app->previous_school : null,
            ]);
            $app->update(['status' => 'accepted', 'student_id' => $student->id]);

            return $student;
        });

        Activity::log('accept', $app, 'قبول طلب تسجيل: '.$app->student_name);

        return response()->json(['message' => 'تم قبول الطلب وتسجيل الطالب.', 'student_id' => $student->id]);
    }

    public function reject(Request $request, $id)
    {
        $app = $this->find($id);
        $note = $request->validate(['reason' => ['nullable', 'string', 'max:500']])['reason'] ?? null;
        $app->update(['status' => 'rejected', 'notes' => trim(($app->notes ? $app->notes."\n" : '').($note ? 'سبب الرفض: '.$note : ''))]);
        Activity::log('reject', $app, 'رفض طلب تسجيل: '.$app->student_name);

        return response()->json(['message' => 'تم رفض الطلب.']);
    }
}
