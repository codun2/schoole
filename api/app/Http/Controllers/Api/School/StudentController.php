<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Api\ResourceController;
use App\Http\Controllers\Concerns\HandlesUploads;
use App\Models\Contract;
use App\Models\Grade;
use App\Models\Guardian;
use App\Models\Section;
use App\Models\Student;
use App\Models\StudentAttendance;
use App\Support\Numbering;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class StudentController extends ResourceController
{
    use HandlesUploads;

    protected string $model = Student::class;

    protected array $search = ['name', 'name_en', 'national_id', 'student_no', 'guardian.name', 'guardian.phone'];

    protected array $filters = ['status', 'grade_id', 'section_id', 'bus_id', 'gender', 'guardian_id', 'nationality'];

    protected array $with = ['guardian:id,name,phone', 'grade:id,name_ar', 'section:id,name', 'bus:id,number'];

    protected array $sortable = ['id', 'name', 'registered_at', 'created_at'];

    protected bool $yearScoped = true;

    protected string $label = 'طالب';

    public const STATUSES = ['active', 'pending', 'suspended', 'withdrawn', 'graduated'];

    protected function rules(Request $request, ?Model $record): array
    {
        $req = $record ? 'sometimes' : 'required';

        return [
            'name'          => [$req, 'string', 'max:255'],
            'name_en'       => ['nullable', 'string', 'max:255'],
            'national_id'   => ['nullable', 'string', 'max:40', function ($attr, $value, $fail) use ($request, $record) {
                // civil ID must be unique within the same academic year (a student re-enrolls each year
                // as a new record with the same ID). Student queries are already scoped to the company.
                if ($value === null || trim((string) $value) === '') {
                    return;
                }
                $yearId = $record ? $record->academic_year_id : $this->yearId($request);
                $taken = Student::where('national_id', trim((string) $value))->where('academic_year_id', $yearId)->when($record, fn ($q) => $q->where('id', '!=', $record->id))->exists();
                if ($taken) {
                    $fail('رقم الهوية مستخدم لطالب آخر في نفس السنة الدراسية.');
                }
            }],
            'student_no'    => ['nullable', 'string', 'max:40'],
            'gender'        => ['nullable', 'in:male,female'],
            'birth_date'    => ['nullable', 'date'],
            'nationality'   => ['nullable', 'string', 'max:80'],
            'guardian_id'   => ['nullable', 'integer', $this->owned('guardians')],
            'grade_id'      => ['nullable', 'integer', $this->owned('grades')],
            'section_id'    => ['nullable', 'integer', $this->owned('sections')],
            'bus_id'        => ['nullable', 'integer', $this->owned('buses')],
            'status'        => ['nullable', 'in:'.implode(',', self::STATUSES)],
            'registered_at' => ['nullable', 'date'],
            'blood_type'    => ['nullable', 'string', 'max:5'],
            'medical_notes' => ['nullable', 'string'],
            'address'       => ['nullable', 'string', 'max:255'],
            'custom'        => ['nullable', 'array'],
            'notes'         => ['nullable', 'string'],
            'photo'         => ['nullable', 'image', 'max:5120'], // optional student photo (≤5MB)
            'remove_photo'  => ['nullable', 'boolean'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        if (! $record) {
            $data['registered_at'] = $data['registered_at'] ?? now()->toDateString();
            $data['status'] = $data['status'] ?? 'active';
            if (empty($data['student_no'])) {
                $data['student_no'] = Numbering::next(Student::class, 'ST-', 5, 'student_no');
            }
        }
        if (! empty($data['section_id'])) {
            $data['grade_id'] = Section::find($data['section_id'])->grade_id;
        }
        if (! empty($data['grade_id'])) {
            $data['academic_year_id'] = Grade::find($data['grade_id'])->academic_year_id;
        }
        $data = $this->applyPhoto($data, $request, $record, 'students');

        return $data;
    }

    /** Store a newly uploaded photo, honour an explicit removal, otherwise leave the column untouched. */
    private function applyPhoto(array $data, Request $request, ?Model $record, string $folder): array
    {
        unset($data['remove_photo']);
        if ($request->hasFile('photo')) {
            if ($record) {
                $this->deleteImage($record->photo);
            }
            $data['photo'] = $this->storeImage($request->file('photo'), $folder);
        } else {
            unset($data['photo']);
            if ($record && $request->boolean('remove_photo')) {
                $this->deleteImage($record->photo);
                $data['photo'] = null;
            }
        }

        return $data;
    }

    protected function transform(Model $record, bool $detail = false)
    {
        if ($detail) {
            $record->contracts = Contract::where('student_id', $record->id)->orderByDesc('id')->get(['id', 'number', 'date', 'total', 'paid', 'remaining', 'status']);
            $att = StudentAttendance::where('student_id', $record->id)->selectRaw('status, COUNT(*) c')->groupBy('status')->pluck('c', 'status');
            $record->attendance_summary = [
                'present' => (int) ($att['present'] ?? 0),
                'absent'  => (int) ($att['absent'] ?? 0),
                'late'    => (int) ($att['late'] ?? 0),
                'excused' => (int) ($att['excused'] ?? 0),
            ];
            $record->recent_absences = StudentAttendance::where('student_id', $record->id)->whereIn('status', ['absent', 'late'])->orderByDesc('date')->limit(10)->get(['date', 'status', 'note']);
        }

        return $record;
    }

    protected function cannotDelete(Model $record): ?string
    {
        return Contract::where('student_id', $record->id)->where('status', '!=', 'cancelled')->exists()
            ? 'لا يمكن حذف طالب له عقود — قم بإلغاء العقود أولاً أو غيّر حالته إلى منسحب.'
            : null;
    }

    protected function beforeDelete(Model $record): void
    {
        StudentAttendance::where('student_id', $record->id)->delete();
        $this->deleteImage($record->photo);
    }

    /** Move many students to a section (or change status) at once. */
    public function bulk(Request $request)
    {
        $data = $request->validate([
            'ids'        => ['required', 'array'],
            'ids.*'      => ['integer'],
            'section_id' => ['nullable', 'integer', $this->owned('sections')],
            'bus_id'     => ['nullable', 'integer', $this->owned('buses')],
            'status'     => ['nullable', 'in:'.implode(',', self::STATUSES)],
        ]);
        $patch = [];
        if (! empty($data['section_id'])) {
            $s = Section::find($data['section_id']);
            $patch += ['section_id' => $s->id, 'grade_id' => $s->grade_id];
        }
        if (array_key_exists('bus_id', $data) && $request->has('bus_id')) {
            $patch['bus_id'] = $data['bus_id'];
        }
        if (! empty($data['status'])) {
            $patch['status'] = $data['status'];
        }
        $n = $patch ? Student::whereIn('id', $data['ids'])->update($patch) : 0;

        return response()->json(['message' => "تم تحديث {$n} طالب."]);
    }

    /**
     * Import rows from a parsed sheet. Columns: name, national_id, gender, birth_date,
     * nationality, grade (name), section (name), guardian_name, guardian_phone, guardian_national_id.
     */
    public function import(Request $request)
    {
        $data = $request->validate(['rows' => ['required', 'array', 'max:3000']]);
        $yearId = $this->yearId($request);
        $grades = Grade::where('academic_year_id', $yearId)->get();
        $created = 0;
        $skipped = [];

        foreach ($data['rows'] as $i => $row) {
            $name = trim((string) ($row['name'] ?? ''));
            if ($name === '') {
                $skipped[] = ['row' => $i + 2, 'reason' => 'اسم الطالب فارغ'];
                continue;
            }
            $nid = trim((string) ($row['national_id'] ?? ''));
            if ($nid !== '' && Student::where('academic_year_id', $yearId)->where('national_id', $nid)->exists()) {
                $skipped[] = ['row' => $i + 2, 'reason' => 'الطالب مسجّل مسبقاً'];
                continue;
            }
            $grade = isset($row['grade']) ? $grades->first(fn ($g) => trim($g->name_ar) === trim((string) $row['grade']) || trim((string) $g->name_en) === trim((string) $row['grade'])) : null;
            $section = $grade && isset($row['section'])
                ? Section::where('grade_id', $grade->id)->where('name', trim((string) $row['section']))->first()
                : null;

            $guardian = null;
            $gPhone = trim((string) ($row['guardian_phone'] ?? ''));
            $gNid = trim((string) ($row['guardian_national_id'] ?? ''));
            if ($gNid !== '') {
                $guardian = Guardian::where('national_id', $gNid)->first();
            }
            if (! $guardian && $gPhone !== '') {
                $guardian = Guardian::where('phone', $gPhone)->first();
            }
            if (! $guardian && ! empty($row['guardian_name'])) {
                $guardian = Guardian::create(['name' => trim((string) $row['guardian_name']), 'phone' => $gPhone ?: null, 'national_id' => $gNid ?: null, 'nationality' => $row['nationality'] ?? null]);
            }

            Student::create([
                'academic_year_id' => $yearId,
                'name'             => $name,
                'national_id'      => $nid ?: null,
                'student_no'       => Numbering::next(Student::class, 'ST-', 5, 'student_no'),
                'gender'           => in_array($row['gender'] ?? '', ['female', 'أنثى', 'انثى', 'F', 'f'], true) ? 'female' : 'male',
                'birth_date'       => ! empty($row['birth_date']) ? date('Y-m-d', strtotime((string) $row['birth_date'])) : null,
                'nationality'      => $row['nationality'] ?? null,
                'grade_id'         => $grade?->id,
                'section_id'       => $section?->id,
                'guardian_id'      => $guardian?->id,
                'status'           => 'active',
                'registered_at'    => now()->toDateString(),
            ]);
            $created++;
        }

        return response()->json(['created' => $created, 'skipped' => $skipped]);
    }
}
