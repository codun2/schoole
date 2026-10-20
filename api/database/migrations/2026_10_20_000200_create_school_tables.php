<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Schools module: years, grades, sections, buses, guardians, students, applications, attendance, custom fields. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('academic_years', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('name', 40);
            $t->date('start_date')->nullable();
            $t->date('end_date')->nullable();
            $t->boolean('is_current')->default(false);
            $t->timestamps();
        });

        Schema::create('grades', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('academic_year_id')->index();
            $t->string('name_ar');
            $t->string('name_en')->nullable();
            $t->unsignedInteger('sort')->default(0);
            $t->timestamps();
        });

        Schema::create('sections', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('academic_year_id')->index();
            $t->unsignedBigInteger('grade_id')->index();
            $t->string('name');
            $t->unsignedInteger('capacity')->default(30);
            $t->string('room')->nullable();
            $t->unsignedBigInteger('teacher_id')->nullable(); // employees.id (class teacher)
            $t->timestamps();
        });

        Schema::create('buses', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('academic_year_id')->index();
            $t->string('number');
            $t->string('type')->nullable();
            $t->string('driver_name')->nullable();
            $t->string('driver_phone')->nullable();
            $t->string('supervisor_name')->nullable();
            $t->unsignedInteger('capacity')->default(0);
            $t->decimal('price', 12, 3)->default(0);
            $t->string('route')->nullable();
            $t->timestamps();
        });

        Schema::create('guardians', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('user_id')->nullable();
            $t->string('name');
            $t->string('national_id')->nullable();
            $t->string('nationality')->nullable();
            $t->string('phone')->nullable()->index();
            $t->string('phone2')->nullable();
            $t->string('email')->nullable();
            $t->string('relation')->nullable(); // أب، أم، ...
            $t->string('job')->nullable();
            $t->string('workplace')->nullable();
            $t->string('address')->nullable();
            $t->json('custom')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
        });

        Schema::create('students', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('academic_year_id')->index();
            $t->unsignedBigInteger('guardian_id')->nullable()->index();
            $t->unsignedBigInteger('grade_id')->nullable()->index();
            $t->unsignedBigInteger('section_id')->nullable()->index();
            $t->unsignedBigInteger('bus_id')->nullable()->index();
            $t->string('student_no')->nullable();
            $t->string('name');
            $t->string('name_en')->nullable();
            $t->string('national_id')->nullable();
            $t->string('gender', 10)->default('male');
            $t->date('birth_date')->nullable();
            $t->string('nationality')->nullable();
            $t->string('status', 20)->default('active'); // active | pending | suspended | withdrawn | graduated
            $t->date('registered_at')->nullable();
            $t->string('photo')->nullable();
            $t->string('blood_type', 5)->nullable();
            $t->text('medical_notes')->nullable();
            $t->string('address')->nullable();
            $t->json('custom')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
        });

        Schema::create('custom_fields', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('entity', 20)->default('student'); // student | guardian
            $t->string('label');
            $t->string('key', 60);
            $t->string('type', 20)->default('text'); // text | number | date | select
            $t->json('options')->nullable();
            $t->boolean('required')->default(false);
            $t->unsignedInteger('sort')->default(0);
            $t->timestamps();
        });

        Schema::create('applications', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('academic_year_id')->nullable()->index();
            $t->unsignedBigInteger('grade_id')->nullable();
            $t->string('student_name');
            $t->string('gender', 10)->default('male');
            $t->date('birth_date')->nullable();
            $t->string('nationality')->nullable();
            $t->string('national_id')->nullable();
            $t->string('previous_school')->nullable();
            $t->string('guardian_name');
            $t->string('guardian_phone');
            $t->string('guardian_national_id')->nullable();
            $t->string('guardian_email')->nullable();
            $t->string('guardian_relation')->nullable();
            $t->string('source', 20)->default('online'); // online | office
            $t->string('status', 20)->default('new'); // new | accepted | rejected
            $t->unsignedBigInteger('student_id')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
        });

        Schema::create('student_attendances', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('academic_year_id')->index();
            $t->unsignedBigInteger('student_id')->index();
            $t->unsignedBigInteger('section_id')->nullable()->index();
            $t->date('date')->index();
            $t->string('status', 12)->default('present'); // present | absent | late | excused
            $t->string('note')->nullable();
            $t->timestamps();
            $t->unique(['student_id', 'date']);
        });
    }

    public function down(): void
    {
        foreach (['student_attendances', 'applications', 'custom_fields', 'students', 'guardians', 'buses', 'sections', 'grades', 'academic_years'] as $tbl) {
            Schema::dropIfExists($tbl);
        }
    }
};
