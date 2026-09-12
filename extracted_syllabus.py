#!/usr/bin/env python3
"""
Extract and parse syllabus content from .docx files to structured JSON format for the website.
This script processes all .docx files in the extracted syllabus directory and creates structured data
that can be used to populate the curriculum modules in the website.
"""

import json
import os
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Any
import re
from datetime import datetime

def extract_text_from_docx(docx_path: str) -> str:
    """Extract plain text from a .docx file"""
    try:
        with zipfile.ZipFile(docx_path, 'r') as zip_ref:
            # Read document.xml
            document_xml = zip_ref.read('word/document.xml').decode('utf-8')

            # Parse XML to extract text
            root = ET.fromstring(document_xml)

            # Namespaces for Word XML
            namespaces = {
                'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
                'w14': 'http://schemas.microsoft.com/office/word/14/main',
                'w15': 'http://schemas.microsoft.com/office/word/15/main'
            }

            # Remove namespaces for easier processing
            for namespace in namespaces:
                document_xml = document_xml.replace(f'{{{namespaces[namespace]}}}', '')

            root = ET.fromstring(document_xml)

            # Extract text from paragraphs
            text_elements = []
            for elem in root.iter():
                if elem.tag.endswith('}p'):  # paragraph
                    # Extract text from runs within the paragraph
                    paragraph_text = []
                    for run in elem.findall('.//{*}r'):
                        if run.find('.//{*}t') is not None:
                            text_elem = run.find('.//{*}t')
                            if text_elem is not None and text_elem.text:
                                paragraph_text.append(text_elem.text)

                    if paragraph_text:
                        text_elements.append(''.join(paragraph_text))

            return '\n\n'.join(text_elements)

    except Exception as e:
        print(f"Error extracting {docx_path}: {e}")
        return ""

def parse_syllabus_content(text: str) -> Dict[str, Any]:
    """Parse extracted text to identify syllabus structure and content"""

    # Initialize result structure
    result = {
        "metadata": {},
        "modules": [],
        "objectives": [],
        "outcomes": [],
        "assessments": [],
        "raw_text": text
    }

    # Extract metadata (Program Name, Course Name, etc.)
    metadata_patterns = {
        r'Program Name[:\s]*(.+?)\s*(?=\n\n|\n[A-Z]|$)' : 'program_name',
        r'Course Name[:\s]*(.+?)\s*(?=\n\n|\n[A-Z]|$)' : 'course_name',
        r'Type[:\s]*(.+?)\s*(?=\n\n|\n[A-Z]|$)' : 'type',
        r'Code[:\s]*(.+?)\s*(?=\n\n|\n[A-Z]|$)' : 'code',
        r'Semester[:\s]*(.+?)\s*(?=\n\n|\n[A-Z]|$)' : 'semester',
        r'Teaching Hours/Periods[:\s]*(.+?)\s*(?=\n\n|\n[A-Z]|$)' : 'teaching_hours',
        r'CIE Marks[:\s]*(.+?)\s*(?=\n\n|\n[A-Z]|$)' : 'cie_marks',
        r'Credits[:\s]*(.+?)\s*(?=\n\n|\n[A-Z]|$)' : 'credits',
        r'SEE Marks[:\s]*(.+?)\s*(?=\n\n|\n[A-Z]|$)' : 'see_marks',
        r'Examination Type[:\s]*(.+?)\s*(?=\n\n|\n[A-Z]|$)' : 'exam_type',
        r'Examination Hours[:\s]*(.+?)\s*(?=\n\n|\n[A-Z]|$)' : 'exam_hours',
    }

    for pattern, key in metadata_patterns.items():
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            result['metadata'][key] = match.group(1).strip()

    # Extract course objectives
    obj_pattern = r'COURSE OBJECTIVES(?:\s*AND|\s*)OUTCOMES[:\s]*(.+?)\s*(?=\n\n|\n[A-Z]|$)'
    obj_match = re.search(obj_pattern, text, re.IGNORECASE | re.MULTILINE | re.DOTALL)
    if obj_match:
        obj_text = obj_match.group(1)
        # Extract bullet points or numbered list items
        obj_lines = re.findall(r'[\*\-\+]\s*(.+?)\s*(?=\n|\.|$)', obj_text)
        if not obj_lines:
            # Try to extract from OBJRCTIVES section
            obj_match2 = re.search(r'OBJRCTIVES:\s*(.+?)\s*(?=\n\n|\n[A-Z]|$)', text, re.IGNORECASE | re.DOTALL)
            if obj_match2:
                obj_text = obj_match2.group(1)
                obj_lines = re.findall(r'[\*\-\+]\s*(.+?)\s*(?=\n|\.|$)', obj_text)

        result['objectives'] = [line.strip() for line in obj_lines if line.strip()]

    # Extract course outcomes
    outcome_pattern = r'OUTCOMES[:\s]*(.+?)\s*(?=\n\n|\n[A-Z]|$)'
    outcome_match = re.search(outcome_pattern, text, re.IGNORECASE | re.DOTALL)
    if outcome_match:
        outcome_text = outcome_match.group(1)
        # Extract bullet points or numbered list items
        outcome_lines = re.findall(r'[\*\-\+]\s*(.+?)\s*(?=\n|\.|$)', outcome_text)
        if not outcome_lines:
            # Try to extract from OUTCOMES section
            out_match2 = re.search(r'OUTCOMES:\s*(.+?)\s*(?=\n\n|\n[A-Z]|$)', text, re.IGNORECASE | re.DOTALL)
            if out_match2:
                outcome_text = out_match2.group(1)
                outcome_lines = re.findall(r'[\*\-\+]\s*(.+?)\s*(?=\n|\.|$)', outcome_text)

        result['outcomes'] = [line.strip() for line in outcome_lines if line.strip()]

    # Extract module-wise detailed syllabus
    module_pattern = r'Module\s+(\d+)[:\s]*(.+?)\s*(?=Module\s+\d+:|\n\n[A-Z]|$)'
    module_matches = re.findall(module_pattern, text, re.IGNORECASE | re.DOTALL)

    for mod_num, mod_content in module_matches:
        module = {
            'module_number': int(mod_num),
            'title': mod_content.split('\n')[0].strip(),
            'hours': None,
            'topics': [],
            'co_mapping': None
        }

        # Extract hours from the content
        hours_match = re.search(r'Hours:\s*(\d+)', mod_content, re.IGNORECASE)
        if hours_match:
            module['hours'] = int(hours_match.group(1))

        # Extract topics/listings
        topic_patterns = [
            r'\*\s*(.+?)\s*(?=\n|\.)',
            r'\-\s*(.+?)\s*(?=\n|\.)',
            r'\+\s*(.+?)\s*(?=\n|\.)',
        ]

        for pattern in topic_patterns:
            topics = re.findall(pattern, mod_content, re.MULTILINE)
            if topics:
                module['topics'].extend([t.strip() for t in topics if t.strip()])
                break

        # Extract CO mapping
        co_match = re.search(r'CO\s+Mapping:\s*CO(\d+)', mod_content, re.IGNORECASE)
        if co_match:
            module['co_mapping'] = f"CO{co_match.group(1)}"

        if module['title'] or module['topics']:
            result['modules'].append(module)

    return result

def main():
    """Main function to process all syllabus files"""

    # Base directory containing syllabus files
    base_dir = "/Users/saislife/Library/Mobile Documents/com~apple~CloudDocs/Administration/Nadagurukulam/Website/Beta Project files/Theory Curriculums"

    # Output file for processed syllabus data
    output_file = "/Users/saislife/Documents/GitHub/nadagurukulam-website/processed_syllabus.json"

    # Collect all .docx files
    syllabus_files = []
    for filename in os.listdir(base_dir):
        if filename.endswith('.docx') and 'son' not in filename.lower():
            syllabus_files.append(os.path.join(base_dir, filename))

    print(f"Found {len(syllabus_files)} syllabus files to process:")
    for file in syllabus_files:
        print(f"  - {os.path.basename(file)}")

    # Process each file and collect results
    processed_syllabi = []

    for file_path in syllabus_files:
        print(f"\nProcessing {os.path.basename(file_path)}...")

        # Extract text
        raw_text = extract_text_from_docx(file_path)
        if not raw_text:
            print(f"  Warning: Could not extract text from {os.path.basename(file_path)}")
            continue

        # Parse the extracted text
        syllabus_data = parse_syllabus_content(raw_text)

        # Add metadata
        syllabus_data['source_file'] = os.path.basename(file_path)
        from datetime import datetime
        syllabus_data['processed_date'] = datetime.now().isoformat()

        processed_syllabi.append(syllabus_data)

        print(f"  Processed successfully")
        print(f"  - Title: {syllabus_data['metadata'].get('course_name', 'N/A')}")
        print(f"  - Objectives: {len(syllabus_data['objectives'])}")
        print(f"  - Outcomes: {len(syllabus_data['outcomes'])}")
        print(f"  - Modules: {len(syllabus_data['modules'])}")

    # Save processed data to JSON file
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(processed_syllabi, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*80}")
    print(f"Processed {len(processed_syllabi)} syllabus files successfully!")
    print(f"Output saved to: {output_file}")
    print(f"{'='*80}")

    # Print summary
    for i, syllabus in enumerate(processed_syllabi, 1):
        print(f"\n{syllabus['metadata'].get('course_name', f'Course {i}')}:")
        print(f"  Code: {syllabus['metadata'].get('code', 'N/A')}")
        print(f"  Semester: {syllabus['metadata'].get('semester', 'N/A')}")
        print(f"  Objectives: {len(syllabus['objectives'])}")
        print(f"  Outcomes: {len(syllabus['outcomes'])}")
        print(f"  Modules: {len(syllabus['modules'])}")

if __name__ == "__main__":
    main()