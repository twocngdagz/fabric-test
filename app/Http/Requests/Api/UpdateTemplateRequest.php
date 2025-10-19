<?php

namespace App\Http\Requests\Api;

use Illuminate\Foundation\Http\FormRequest;

class UpdateTemplateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        // Support minimal { version, canvas:{width,height}, frames:[] } during updates as well.
        $hasMinimal = $this->has(['canvas.width', 'canvas.height']) && $this->has('frames');
        if ($hasMinimal) {
            $this->merge([
                'canvas_width' => (int) $this->input('canvas.width'),
                'canvas_height' => (int) $this->input('canvas.height'),
                'elements' => $this->input('frames', []),
            ]);
        }
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:120'],
            'canvas_width' => ['sometimes', 'integer', 'min:1', 'max:8192'],
            'canvas_height' => ['sometimes', 'integer', 'min:1', 'max:8192'],
            'elements' => ['sometimes', 'array'],
        ];
    }
}
