# english_writing.py - 英文写作学习模式
"""
EnglishWritingMode - 英文写作学习模式（整合三阶段）

阶段1: 获取写作任务 (generate_task)
阶段2: 写作过程引导 (get_guidance) - 苏格拉底式，不改写
阶段3: 完成后反馈 (get_feedback) - 鼓励性，不打分
"""

import random
from datetime import datetime
from typing import Dict, List, Any

from ..models import LearningModeConfig, TaskResult
from .base import BaseLearningMode


class EnglishWritingMode(BaseLearningMode):
    """
    英文写作学习模式 - 整合三个阶段

    阶段1: 获取写作任务 (generate_task)
    阶段2: 写作过程引导 (get_guidance) - 苏格拉底式，不改写
    阶段3: 完成后反馈 (get_feedback) - 鼓励性，不打分
    """

    def _get_config(self) -> LearningModeConfig:
        return LearningModeConfig(
            mode_id="english_writing",
            name="英文寫作",
            name_en="English Writing",
            icon="✏️",
            description="完整的寫作學習：獲取題目 → 寫作引導 → 反饋評語",
            description_en="Complete writing journey: Get task → Guidance → Feedback",
            subjects=["english"],
            levels=["S1", "S2", "S3", "S4", "S5", "S6"],
            enabled=True,
            order=2,
            settings={
                "word_range": {
                    "S1": {"min": 60, "max": 80},
                    "S2": {"min": 80, "max": 100},
                    "S3": {"min": 120, "max": 150},
                    "S4": {"min": 150, "max": 180},
                    "S5": {"min": 200, "max": 250},
                    "S6": {"min": 250, "max": 300}
                }
            }
        )

    # ==================== 写作任务模板 ====================

    def _get_task_templates(self) -> Dict[str, List[Dict]]:
        return {
            "S1": [
                {"topic": "My Favourite Place at Home",
                 "instructions": "Write a short paragraph (60–80 words) describing your favourite place at home. Explain what this place looks like and why you like spending time there.",
                 "guiding_questions": ["Where is this place?", "What do you usually do there?",
                                       "How does it make you feel?"], "type": "descriptive"},
                {"topic": "My Best Friend",
                 "instructions": "Write a short paragraph (60–80 words) about your best friend. Describe who they are and why they are special to you.",
                 "guiding_questions": ["How did you meet?", "What do you like about them?",
                                       "What activities do you do together?"], "type": "descriptive"},
                {"topic": "My Favourite Food",
                 "instructions": "Write a short paragraph (60–80 words) about your favourite food. Describe what it tastes like and when you usually eat it.",
                 "guiding_questions": ["What is your favourite food?", "Why do you like it?",
                                       "When do you usually eat it?"], "type": "descriptive"},
                {"topic": "A Fun Weekend",
                 "instructions": "Write a short paragraph (60–80 words) about a fun weekend you had. Describe what you did and who you were with.",
                 "guiding_questions": ["What did you do?", "Who was with you?", "Why was it fun?"],
                 "type": "narrative"},
                {"topic": "My School Bag",
                 "instructions": "Write a short paragraph (60–80 words) describing your school bag. Tell us what is inside and why you chose this bag.",
                 "guiding_questions": ["What does your bag look like?", "What items are inside?",
                                       "Why did you choose it?"], "type": "descriptive"}
            ],
            "S2": [
                {"topic": "A Day Without Technology",
                 "instructions": "Write a short passage (80–100 words) about spending one whole day without any electronic devices. Describe what you did and how you felt.",
                 "guiding_questions": ["What activities did you try instead?", "Was it difficult or enjoyable? Why?"],
                 "type": "narrative"},
                {"topic": "My Ideal Classroom",
                 "instructions": "Write a short passage (80–100 words) describing your ideal classroom. What would it look like and what features would it have?",
                 "guiding_questions": ["What furniture and decorations would be there?",
                                       "What technology would you include?",
                                       "How would it help students learn better?"], "type": "descriptive"},
            ],
            "S3": [
                {"topic": "The Importance of Exercise",
                 "instructions": "Write a passage (120–150 words) explaining why regular exercise is important for teenagers. Include at least two benefits.",
                 "guiding_questions": ["What are the physical benefits?", "What are the mental benefits?",
                                       "How can teenagers fit exercise into busy schedules?"], "type": "expository"},
                {"topic": "A Lesson I Learned the Hard Way",
                 "instructions": "Write a passage (120–150 words) about a time when you learned an important lesson through a difficult experience.",
                 "guiding_questions": ["What happened?", "What did you learn?",
                                       "How did this experience change you?"], "type": "narrative"},
            ],
            "S4": [
                {"topic": "Should Homework Be Abolished?",
                 "instructions": "Write a passage (150–180 words) presenting your view on whether homework should be abolished. Give reasons for your opinion.",
                 "guiding_questions": ["What are the benefits of homework?", "What are the drawbacks?",
                                       "What alternative approaches might work?"], "type": "argumentative"},
            ],
            "S5": [
                {"topic": "The Impact of Social Media on Teenagers",
                 "instructions": "Write an essay (200–250 words) discussing both positive and negative effects of social media on teenagers.",
                 "guiding_questions": ["What benefits does social media provide?",
                                       "What are the potential risks or harms?",
                                       "How can teenagers use social media responsibly?"], "type": "argumentative"},
            ],
            "S6": [
                {"topic": "A Turning Point in My Life",
                 "instructions": "Write a reflective essay (250–300 words) about a significant turning point in your life and how it shaped who you are today.",
                 "guiding_questions": ["What was the situation before this turning point?",
                                       "What exactly happened?",
                                       "How did it change your perspective or actions?"], "type": "reflective"},
            ]
        }

    def generate_task(self, level: str, task_type: str = None, **kwargs) -> TaskResult:
        """阶段1: 生成写作任务"""
        templates = self._get_task_templates()
        level_tasks = templates.get(level, templates["S3"])

        if task_type:
            filtered = [t for t in level_tasks if t.get("type") == task_type]
            level_tasks = filtered if filtered else level_tasks

        task = random.choice(level_tasks)
        word_range = self.config.settings["word_range"].get(level, {"min": 100, "max": 150})
        task_id = f"writing_{level}_{datetime.now().strftime('%Y%m%d%H%M%S')}"

        return TaskResult(
            success=True,
            task_id=task_id,
            mode_id="english_writing",
            content={
                **task,
                "level": level,
                "word_range": word_range
            }
        )

    def get_all_tasks_for_level(self, level: str) -> List[Dict]:
        """获取某年级所有任务"""
        templates = self._get_task_templates()
        return templates.get(level, [])

    # ==================== 阶段2: 写作引导 ====================

    def get_guidance_system_prompt(self, level: str, guidance_type: str = "general") -> str:
        level_desc = {
            "S1": "a Secondary 1 student (age 12-13, beginner)",
            "S2": "a Secondary 2 student (age 13-14, elementary)",
            "S3": "a Secondary 3 student (age 14-15, intermediate)",
            "S4": "a Secondary 4 student (age 15-16, upper-intermediate)",
            "S5": "a Secondary 5 student (age 16-17, advanced)",
            "S6": "a Secondary 6 student (age 17-18, proficient)"
        }.get(level, "a secondary school student")

        return f"""You are a supportive AI Writing Companion for {level_desc}.

## STRICT RULES - YOU MUST FOLLOW:
- NEVER rewrite or correct the student's text directly.
- NEVER provide model sentences or sample paragraphs.
- NEVER give a score or grade.
- ONLY ask guiding questions to help the student think.
- Keep questions simple and appropriate for {level}.
- Use encouraging language.

## YOUR ROLE:
Ask 2-3 thoughtful questions that help the student:
1. Clarify their ideas
2. Expand their content
3. Improve their expression

## RESPONSE FORMAT:
Start with brief encouragement, then ask your guiding questions.
Keep your response under 100 words."""

    def get_guidance(self, student_text: str, level: str, guidance_type: str = "general",
                     task_context: str = None) -> Dict[str, Any]:
        """阶段2: 获取写作引导"""
        try:
            system_prompt = self.get_guidance_system_prompt(level, guidance_type)

            user_message = ""
            if task_context:
                user_message += f"Writing Task: {task_context}\n\n"
            user_message += f"Student's current writing:\n\n{student_text}\n\n"
            user_message += "Please provide guiding questions to help this student develop their writing further."

            return {
                "success": True,
                "phase": "guidance",
                "system_prompt": system_prompt,
                "user_message": user_message,
                "level": level,
                "guidance_type": guidance_type,
                "requires_ai_call": True
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==================== 阶段3: 写作反馈 ====================

    def get_feedback_system_prompt(self, level: str) -> str:
        level_desc = {
            "S1": "a Secondary 1 student (age 12-13, beginner)",
            "S2": "a Secondary 2 student (age 13-14, elementary)",
            "S3": "a Secondary 3 student (age 14-15, intermediate)",
            "S4": "a Secondary 4 student (age 15-16, upper-intermediate)",
            "S5": "a Secondary 5 student (age 16-17, advanced)",
            "S6": "a Secondary 6 student (age 17-18, proficient)"
        }.get(level, "a secondary school student")

        return f"""You are an AI Learning Companion providing reflective feedback to {level_desc} after completing a writing task.

## STRICT RULES - YOU MUST FOLLOW:
- Do NOT give a score or grade.
- Do NOT rewrite sentences.
- Do NOT correct every grammar mistake.
- Do NOT compare the student to others.
- Do NOT use advanced terminology inappropriate for {level}.

## YOUR FEEDBACK MUST INCLUDE EXACTLY:

1. **One Strength** 💪
   Identify ONE specific strength related to ideas, structure, expression, or effort.
   Be genuine and specific about what they did well.

2. **One Area to Think About** 🤔
   Suggest ONE area the student could think about or improve.
   Focus on clarity, logic, or expression.
   Frame it as a gentle suggestion, not criticism.

3. **One Reflective Question** ❓
   End with ONE thoughtful question that encourages the student to think about their writing and how they might improve.

## TONE:
- Encouraging and respectful
- Focus on growth, not performance
- Warm but not patronizing
- Treat the student as a developing writer

## LEVEL ALIGNMENT:
- Use language appropriate for {level}
- Keep feedback accessible and clear
- Avoid jargon or complex explanations

## FORMAT:
Write in a conversational, supportive tone. Use the three sections above but make it feel natural, like a supportive mentor.

Your goal is to support learning awareness, NOT assessment."""

    def get_feedback(self, student_text: str, level: str, task_topic: str = None, task_instructions: str = None) -> \
            Dict[str, Any]:
        """阶段3: 获取完成后反馈"""
        try:
            system_prompt = self.get_feedback_system_prompt(level)

            user_message = ""
            if task_topic:
                user_message += f"Writing Topic: {task_topic}\n"
            if task_instructions:
                user_message += f"Task Instructions: {task_instructions}\n"
            user_message += f"\nStudent's Writing:\n\n{student_text}"

            word_count = len(student_text.split())
            user_message += f"\n\n[Word count: {word_count}]"

            return {
                "success": True,
                "phase": "feedback",
                "system_prompt": system_prompt,
                "user_message": user_message,
                "level": level,
                "word_count": word_count,
                "requires_ai_call": True
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def evaluate_response(self, task_id: str, response: str, **kwargs) -> Dict[str, Any]:
        """统一评估接口"""
        return self.get_feedback(
            student_text=response,
            level=kwargs.get("level", "S3"),
            task_topic=kwargs.get("task_topic"),
            task_instructions=kwargs.get("task_instructions")
        )

    # ==================== 辅助方法 ====================

    def get_guidance_types(self) -> List[Dict]:
        return [
            {"id": "general", "name": "General", "name_zh": "綜合引導"},
            {"id": "clarification", "name": "Clarify Ideas", "name_zh": "澄清想法"},
            {"id": "expansion", "name": "Expand Content", "name_zh": "擴展內容"},
            {"id": "reflection", "name": "Reflect", "name_zh": "反思推理"},
            {"id": "structure", "name": "Structure", "name_zh": "組織結構"}
        ]

    def get_writing_types(self) -> List[Dict]:
        return [
            {"id": "descriptive", "name": "Descriptive", "name_zh": "描述性"},
            {"id": "narrative", "name": "Narrative", "name_zh": "敘事性"},
            {"id": "expository", "name": "Expository", "name_zh": "說明性"},
            {"id": "persuasive", "name": "Persuasive", "name_zh": "說服性"},
            {"id": "argumentative", "name": "Argumentative", "name_zh": "議論性"},
            {"id": "reflective", "name": "Reflective", "name_zh": "反思性"}
        ]
