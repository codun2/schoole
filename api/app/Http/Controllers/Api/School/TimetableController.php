<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Section;
use App\Models\Subject;
use App\Models\TimetableEntry;
use App\Support\Activity;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Weekly timetable. School days + periods-per-day live in company settings
 * (defaults: Sun–Thu, 7 periods). A teacher cannot be booked in two sections
 * at the same day+period; save() rejects such clashes.
 */
class TimetableController extends Controller
{
    public const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    private function cfg(Request $request): array
    {
        $s = $request->user()->company->settings ?? [];

        return [
            'days'    => $s['school_days'] ?? [0, 1, 2, 3, 4],
            'periods' => (int) ($s['periods'] ?? 7),
        ];
    }

    public function config(Request $request)
    {
        return response()->json($this->cfg($request) + ['day_names' => self::DAYS]);
    }

    public function updateConfig(Request $request)
    {
        $data = $request->validate([
            'days'    => ['required', 'array', 'min:1'],
            'days.*'  => ['integer', 'between:0,6'],
            'periods' => ['required', 'integer', 'min:1', 'max:12'],
        ]);
        $company = $request->user()->company;
        $company->settings = array_merge($company->settings ?? [], ['school_days' => array_values($data['days']), 'periods' => $data['periods']]);
        $company->save();

        return response()->json(['message' => 'تم حفظ إعدادات الجدول.'] + $this->cfg($request));
    }

    /** Grid for one section: entries keyed "day-period". */
    public function section(Request $request)
    {
        $data = $request->validate(['section_id' => ['required', 'integer', $this->owned('sections')]]);
        $section = Section::with('grade:id,name_ar,name_en')->findOrFail($data['section_id']);
        $entries = TimetableEntry::with(['subject:id,name_ar,name_en', 'teacher:id,name'])->where('section_id', $section->id)->get()
            ->mapWithKeys(fn ($e) => [$e->day.'-'.$e->period => [
                'subject_id' => $e->subject_id, 'subject' => $e->subject?->name_ar,
                'teacher_id' => $e->teacher_id, 'teacher' => $e->teacher?->name, 'room' => $e->room,
            ]]);

        return response()->json(['section' => $section, 'entries' => $entries] + $this->cfg($request));
    }

    public function save(Request $request)
    {
        $data = $request->validate([
            'section_id'          => ['required', 'integer', $this->owned('sections')],
            'entries'             => ['present', 'array'],
            'entries.*.day'       => ['required', 'integer', 'between:0,6'],
            'entries.*.period'    => ['required', 'integer', 'min:1', 'max:12'],
            'entries.*.subject_id' => ['nullable', 'integer', $this->owned('subjects')],
            'entries.*.teacher_id' => ['nullable', 'integer', $this->owned('employees')],
            'entries.*.room'      => ['nullable', 'string', 'max:40'],
        ]);
        $section = Section::findOrFail($data['section_id']);

        // Detect teacher clashes against OTHER sections.
        $clashes = [];
        foreach ($data['entries'] as $e) {
            if (empty($e['teacher_id'])) {
                continue;
            }
            $other = TimetableEntry::with('section:id,name,name_en')->where('teacher_id', $e['teacher_id'])
                ->where('day', $e['day'])->where('period', $e['period'])->where('section_id', '!=', $section->id)->first();
            if ($other) {
                $t = Employee::find($e['teacher_id']);
                $clashes[] = self::DAYS[$e['day']].' / الحصة '.$e['period'].' — المعلم '.($t?->name).' مشغول في شعبة '.($other->section?->name ?? '');
            }
        }
        if ($clashes) {
            return response()->json(['message' => 'تعارض في جدول المعلمين:', 'clashes' => $clashes], 422);
        }

        DB::transaction(function () use ($section, $data) {
            TimetableEntry::where('section_id', $section->id)->get()->each->delete(); // per-model so sync tombstones are written
            foreach ($data['entries'] as $e) {
                if (empty($e['subject_id']) && empty($e['teacher_id'])) {
                    continue;
                }
                TimetableEntry::create([
                    'academic_year_id' => $section->academic_year_id,
                    'section_id'       => $section->id,
                    'day'              => $e['day'],
                    'period'           => $e['period'],
                    'subject_id'       => $e['subject_id'] ?? null,
                    'teacher_id'       => $e['teacher_id'] ?? null,
                    'room'             => $e['room'] ?? null,
                ]);
            }
        });
        Activity::log('timetable', $section, 'تحديث جدول شعبة '.$section->name);

        return response()->json(['message' => 'تم حفظ الجدول.']);
    }

    /** A teacher's weekly schedule across all sections. */
    public function teacher(Request $request, $teacherId)
    {
        $teacher = Employee::findOrFail($teacherId);
        $entries = TimetableEntry::with(['subject:id,name_ar,name_en', 'section:id,name,name_en,grade_id', 'section.grade:id,name_ar,name_en'])
            ->where('teacher_id', $teacher->id)->get()
            ->mapWithKeys(fn ($e) => [$e->day.'-'.$e->period => [
                'subject' => $e->subject?->name_ar,
                'section' => trim(($e->section?->grade?->name_ar ?? '').' / '.($e->section?->name ?? ''), ' /'),
                'room'    => $e->room,
            ]]);
        $load = TimetableEntry::where('teacher_id', $teacher->id)->count();

        return response()->json(['teacher' => $teacher->only(['id', 'name', 'number']), 'entries' => $entries, 'load' => $load] + $this->cfg($request));
    }

    /** Teaching load (lessons/week) for every teacher — helps balance assignments. */
    public function load(Request $request)
    {
        $counts = TimetableEntry::selectRaw('teacher_id, COUNT(*) c')->whereNotNull('teacher_id')->groupBy('teacher_id')->pluck('c', 'teacher_id');

        return response()->json(Employee::where('is_teacher', true)->where('status', '!=', 'terminated')->orderBy('name')->get(['id', 'name', 'number'])
            ->map(fn ($t) => ['id' => $t->id, 'name' => $t->name, 'number' => $t->number, 'lessons' => (int) ($counts[$t->id] ?? 0)]));
    }
}
